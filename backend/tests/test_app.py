from fastapi.testclient import TestClient

from app.main import app

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
