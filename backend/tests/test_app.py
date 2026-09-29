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
    assert 'main_topic' in payload['brief']
    assert set(payload['outputs']) >= {'executive_summary', 'advisory', 'linkedin'}
    assert set(payload['validation']) >= {'executive_summary', 'advisory', 'linkedin'}
    assert payload['generation_mode'] in {'llm', 'fallback'}


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
    class FakeMessage:
        content = '{"main_topic": "Acme Ltd", "summary": "Acme Ltd reported 12% revenue growth in Q1 2026.", "key_facts": ["12% revenue growth in Q1 2026", "Expansion of product team"], "dates": ["Q1 2026"], "entities": ["Acme Ltd", "Q1 2026"], "impact": ["Potential operational scale-up"], "risks": ["Shipping delays may affect launch timing"], "recommended_actions": ["Prepare contingency for shipping"], "uncertainties": ["Shipping delays have not been confirmed."], "evidence_references": ["Acme source text"]}'

    class FakeCompletions:
        def create(self, **kwargs):
            return type('Response', (), {'choices': [type('Choice', (), {'message': FakeMessage()})()]})()

    class FakeClient:
        def __init__(self, api_key):
            self.chat = type('Chat', (), {'completions': FakeCompletions()})()

    monkeypatch.setattr('app.services.llm_client.settings', type('Settings', (), {'OPENAI_API_KEY': 'test-key', 'OPENAI_MODEL': 'gpt-4o-mini'})(), raising=False)
    monkeypatch.setattr('app.services.llm_client.OpenAI', FakeClient)

    brief = brief_module.build_content_brief('Acme Ltd reported 12% revenue growth in Q1 2026. Shipping delays may affect launch timing.', {'audience': 'leadership'})
    assert brief['main_topic'] == 'Acme Ltd'
    assert '12% revenue growth' in brief['key_facts'][0]
    assert 'Shipping delays have not been confirmed.' in ' '.join(brief['uncertainties'])


def test_fallback_behavior_without_api_key(monkeypatch):
    monkeypatch.setattr('app.services.llm_client.settings', type('Settings', (), {'OPENAI_API_KEY': '', 'OPENAI_MODEL': 'gpt-4o-mini'})(), raising=False)
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
