import pytest
from fastapi.testclient import TestClient

from app.main import app
from app.services import brief as brief_module
from app.services.validation import validate_output

client = TestClient(app)


def test_health_endpoint():
    response = client.get('/health')
    assert response.status_code == 200
    assert response.json()['status'] == 'ok'


def test_source_validation_and_extraction():
    response = client.post('/api/source', data={'text': 'This is a test source with a date of 2026-01-15 and a key fact about revenue growth.'})
    assert response.status_code == 200
    payload = response.json()
    assert 'revenue growth' in payload['text']
    assert payload['metadata']['source_type'] == 'pasted_text'


def test_generate_returns_brief_and_outputs():
    response = client.post(
        '/api/generate',
        json={
            'source_text': 'Acme Ltd announced a 12% revenue increase in Q1 2026. The company plans to expand its product team. Risk includes shipping delays. The update is intended for executive leadership.',
            'config': {
                'audience': 'executive leaders',
                'tone': 'professional',
                'language': 'English',
                'detail_level': 'moderate',
                'communication_objective': 'inform and guide action',
                'output_types': ['executive_summary', 'advisory', 'linkedin'],
            },
        },
    )
    assert response.status_code == 200
    payload = response.json()
    assert set(payload) == {'brief', 'outputs', 'validation', 'source_metadata', 'generation_mode'}
    assert 'main_topic' in payload['brief']
    assert set(payload['outputs']) >= {'executive_summary', 'advisory', 'linkedin'}
    assert set(payload['validation']) >= {'executive_summary', 'advisory', 'linkedin'}
    assert payload['generation_mode'] in {'llm', 'fallback'}


@pytest.mark.parametrize('output_type', ['executive_summary', 'advisory', 'linkedin'])
def test_regenerate_uses_request_brief_and_validates_selected_output(output_type):
    app.state.current_brief = None
    brief = {
        'main_topic': 'Request supplied incident brief',
        'summary': 'The request brief is the source of truth.',
        'key_facts': ['The request brief is the source of truth.'],
        'dates': [],
        'entities': [],
        'impact': [],
        'risks': [],
        'recommended_actions': ['Review the request-supplied facts.'],
        'uncertainties': [],
        'evidence_references': ['Request brief reference.'],
    }

    response = client.post(
        '/api/output/regenerate',
        json={'output_type': output_type, 'config': {}, 'brief': brief},
    )

    assert response.status_code == 200
    payload = response.json()
    assert set(payload) == {'output_type', 'output', 'validation'}
    assert payload['output_type'] == output_type
    assert payload['validation']['status'] in {'passed', 'warning', 'failed'}
    if output_type == 'linkedin':
        assert 'Request supplied incident brief' in payload['output']['hook']
    else:
        assert 'Request supplied incident brief' in payload['output']['title']
    assert app.state.current_brief is None


def test_regenerate_normalizes_output_type_before_validation():
    response = client.post(
        '/api/output/regenerate',
        json={
            'output_type': 'EXECUTIVE_SUMMARY',
            'config': {},
            'brief': {'main_topic': 'Uppercase output type'},
        },
    )

    assert response.status_code == 200
    assert response.json()['output_type'] == 'executive_summary'


def test_regenerate_rejects_unsupported_output_type():
    response = client.post(
        '/api/output/regenerate',
        json={
            'output_type': 'blog',
            'config': {},
            'brief': {'main_topic': 'Request brief'},
        },
    )

    assert response.status_code == 400
    assert response.json()['detail'] == 'Unsupported output type for regeneration.'


def test_brief_schema_has_expected_fields():
    response = client.post(
        '/api/generate',
        json={
            'source_text': 'The company is expanding into EU markets. It expects 30% faster onboarding in the next quarter.',
            'config': {'audience': 'team', 'tone': 'professional', 'language': 'English', 'detail_level': 'brief', 'communication_objective': 'inform', 'output_types': ['executive_summary']},
        },
    )
    assert response.status_code == 200
    brief = response.json()['brief']
    for field in ['main_topic', 'summary', 'key_facts', 'dates', 'entities', 'impact', 'risks', 'recommended_actions', 'uncertainties', 'evidence_references']:
        assert field in brief


def test_output_validation_checks_for_status_field():
    response = client.post(
        '/api/generate',
        json={
            'source_text': 'We are launching a training program in 2027 with a focus on retention and onboarding quality.',
            'config': {'audience': 'team', 'tone': 'professional', 'language': 'English', 'detail_level': 'brief', 'communication_objective': 'inform', 'output_types': ['linkedin']},
        },
    )
    data = response.json()['validation']['linkedin']
    assert 'status' in data
    assert data['status'] in {'passed', 'warning', 'failed'}


def test_deteministic_consistency_checks_are_returned():
    response = client.post(
        '/api/generate',
        json={
            'source_text': 'A 10% reduction in churn is expected by 2027 after the product launch. The team will continue to monitor customer feedback.',
            'config': {'audience': 'team', 'tone': 'professional', 'language': 'English', 'detail_level': 'brief', 'communication_objective': 'inform', 'output_types': ['executive_summary']},
        },
    )
    validation = response.json()['validation']['executive_summary']
    assert 'deterministic_checks' in validation
    assert len(validation['deterministic_checks']) > 0


def test_llm_generation_with_mocked_api_response(monkeypatch):
    class FakeModels:
        def generate_content(self, **kwargs):
            content = '{"main_topic": "Acme Ltd", "summary": "Acme Ltd reported 12% revenue growth in Q1 2026.", "key_facts": ["12% revenue growth in Q1 2026", "Expansion of product team"], "dates": ["Q1 2026"], "entities": ["Acme Ltd", "Q1 2026"], "impact": ["Potential operational scale-up"], "risks": ["Shipping delays may affect launch timing"], "recommended_actions": ["Prepare contingency for shipping"], "uncertainties": ["Shipping delays have not been confirmed."], "evidence_references": ["Acme source text"]}'
            return type('Response', (), {'text': content})()

    class FakeClient:
        def __init__(self, api_key):
            self.models = FakeModels()

    monkeypatch.setattr('app.services.llm_client.settings', type('Settings', (), {'GEMINI_API_KEY': 'test-key', 'GEMINI_MODEL': 'test-model'})(), raising=False)
    monkeypatch.setattr('app.services.llm_client.genai.Client', FakeClient)

    brief = brief_module.build_content_brief('Acme Ltd reported 12% revenue growth in Q1 2026. Shipping delays may affect launch timing.', {'audience': 'leadership'})
    assert brief['main_topic'] == 'Acme Ltd'
    assert '12% revenue growth' in brief['key_facts'][0]
    assert 'Shipping delays have not been confirmed.' in ' '.join(brief['uncertainties'])


def test_fallback_behavior_without_api_key(monkeypatch):
    monkeypatch.setattr('app.services.llm_client.settings', type('Settings', (), {'GEMINI_API_KEY': '', 'GEMINI_MODEL': 'test-model'})(), raising=False)
    brief = brief_module.build_content_brief('Operations were disrupted for 6 hours. Customer data exfiltration has not been confirmed.', {'audience': 'security team'})
    assert isinstance(brief, dict)
    assert 'Operations were disrupted for 6 hours.' in ' '.join(brief['key_facts']) or 'Operations were disrupted for 6 hours.' in brief['summary']


def test_uncertainty_and_fact_preservation_validation():
    brief = {
        'main_topic': 'Incident response',
        'summary': 'Operations were disrupted for 6 hours.',
        'key_facts': ['Operations were disrupted for 6 hours.', 'Customer data exfiltration has not been confirmed.'],
        'dates': ['2026-01-15'],
        'entities': ['Operations'],
        'impact': ['Operations were disrupted for 6 hours.'],
        'risks': ['Customer data exfiltration has not been confirmed.'],
        'recommended_actions': ['Validate the incident before making claims.'],
        'uncertainties': ['Customer data exfiltration has not been confirmed.'],
        'evidence_references': ['Source text'],
    }
    payload = {
        'title': 'Incident response',
        'one_line_summary': 'Operations were disrupted for 6 hours.',
        'situation': 'Operations were disrupted for 6 days.',
        'key_findings': ['Operations were disrupted for 6 days.'],
        'impact': ['Operations were disrupted for 6 days.'],
        'risks': ['Customer data was stolen.'],
        'recommended_actions': ['Notify stakeholders immediately.'],
        'uncertainties': ['Customer data exfiltration has not been confirmed.'],
        'source_references': ['Source text'],
    }
    validation = validate_output('executive_summary', payload, brief)
    assert validation.status == 'failed'
    assert any('unconfirmed' in item.lower() or 'mismatch' in item.lower() for item in validation.errors)


def test_ransomware_uncertainty_is_preserved_in_all_generated_outputs():
    brief = {
        'main_topic': 'Ransomware incident',
        'summary': 'Ransomware affected three servers. There is no confirmed evidence that customer payment information was exfiltrated; the investigation is ongoing.',
        'key_facts': ['Ransomware affected three servers.'],
        'dates': [],
        'entities': [],
        'impact': ['Three servers were affected.'],
        'risks': ['Customer payment information exfiltration is unconfirmed.'],
        'recommended_actions': ['Continue the investigation.'],
        'uncertainties': ['Customer payment information exfiltration is unconfirmed.'],
        'evidence_references': ['Ransomware incident source.'],
    }
    outputs = brief_module.generate_output_variants(brief, {})

    for output_type, payload in outputs.items():
        validation = validate_output(output_type, payload, brief)
        assert validation.status != 'failed', (output_type, validation.errors)

    confirmed_claim = {
        'title': 'Ransomware incident',
        'one_line_summary': 'Customer payment information was exfiltrated.',
        'situation': 'Customer payment information was exfiltrated.',
        'key_findings': ['Customer payment information was exfiltrated.'],
        'impact': ['Customer payment information was exfiltrated.'],
        'risks': ['Customer payment information was exfiltrated.'],
        'recommended_actions': ['Continue the investigation.'],
        'uncertainties': ['Customer payment information exfiltration is unconfirmed.'],
        'source_references': ['Ransomware incident source.'],
    }
    validation = validate_output('executive_summary', confirmed_claim, brief)
    assert validation.status == 'failed'
    assert any('unconfirmed issue' in item.lower() for item in validation.errors)
