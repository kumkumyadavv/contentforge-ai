import { useMemo, useState } from 'react'
import type { ChangeEvent, FormEvent } from 'react'
import './App.css'

type OutputKey = 'executive_summary' | 'advisory' | 'linkedin'

type AppConfig = {
  audience: string
  tone: string
  language: string
  detail_level: string
  communication_objective: string
  output_types: OutputKey[]
}

type ValidationState = {
  status: string
  warnings: string[]
  errors: string[]
  deterministic_checks?: string[]
  ai_assisted_checks?: string[]
}

const defaultConfig: AppConfig = {
  audience: 'executive leaders',
  tone: 'professional',
  language: 'English',
  detail_level: 'moderate',
  communication_objective: 'inform and guide action',
  output_types: ['executive_summary', 'advisory', 'linkedin'],
}

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:8000'
const processingSteps = ['Extracting', 'Understanding', 'Generating', 'Validating']

function App() {
  const [sourceText, setSourceText] = useState('')
  const [pdfFile, setPdfFile] = useState<File | null>(null)
  const [config, setConfig] = useState<AppConfig>(defaultConfig)
  const [processingStep, setProcessingStep] = useState(0)
  const [isProcessing, setIsProcessing] = useState(false)
  const [activeTab, setActiveTab] = useState<'source' | 'summary' | 'advisory' | 'linkedin'>('source')
  const [sourceMeta, setSourceMeta] = useState<Record<string, unknown>>({})
  const [brief, setBrief] = useState<Record<string, unknown> | null>(null)
  const [outputs, setOutputs] = useState<Record<string, any>>({})
  const [validation, setValidation] = useState<Record<string, ValidationState>>({})
  const [error, setError] = useState('')

  const selectedOutputs = useMemo(
    () => new Set(config.output_types),
    [config.output_types],
  )

  const updateConfig = (field: keyof AppConfig, value: string | OutputKey[]) => {
    setConfig((current) => ({ ...current, [field]: value }))
  }

  const toggleOutput = (outputKey: OutputKey) => {
    setConfig((current) => {
      const currentValues = current.output_types.includes(outputKey)
        ? current.output_types.filter((item) => item !== outputKey)
        : [...current.output_types, outputKey]
      return { ...current, output_types: currentValues }
    })
  }

  const handlePdfChange = (event: ChangeEvent<HTMLInputElement>) => {
    setPdfFile(event.target.files?.[0] ?? null)
  }

  const submitSource = async (event?: FormEvent) => {
    event?.preventDefault()
    setError('')

    const formData = new FormData()
    if (pdfFile) {
      formData.append('file', pdfFile)
    } else if (sourceText.trim()) {
      formData.append('text', sourceText)
    } else {
      setError('Paste text or upload a PDF before continuing.')
      return
    }

    try {
      const response = await fetch(`${API_URL}/api/source`, {
        method: 'POST',
        body: formData,
      })

      if (!response.ok) {
        const payload = await response.json().catch(() => ({}))
        throw new Error(payload.detail || 'Source upload failed.')
      }

      const payload = await response.json()
      setSourceText(payload.text || sourceText)
      setSourceMeta(payload.metadata || {})
      setBrief(null)
      setOutputs({})
      setValidation({})
    } catch (caughtError) {
      setError(caughtError instanceof Error ? caughtError.message : 'Source upload failed.')
    }
  }

  const runGeneration = async () => {
    setError('')
    setIsProcessing(true)
    setProcessingStep(0)

    try {
      const response = await fetch(`${API_URL}/api/generate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          source_text: sourceText,
          config,
        }),
      })

      if (!response.ok) {
        const payload = await response.json().catch(() => ({}))
        throw new Error(payload.detail || 'Generation failed.')
      }

      const payload = await response.json()
      setBrief(payload.brief || null)
      setOutputs(payload.outputs || {})
      setValidation(payload.validation || {})
      setSourceMeta(payload.source_metadata || sourceMeta)
      setActiveTab('summary')
    } catch (caughtError) {
      setError(caughtError instanceof Error ? caughtError.message : 'Unexpected generation error.')
    } finally {
      setIsProcessing(false)
      setProcessingStep(processingSteps.length - 1)
    }
  }

  const regenerateOutput = async (outputType: OutputKey) => {
    setError('')
    setIsProcessing(true)
    setProcessingStep(0)

    try {
      const response = await fetch(`${API_URL}/api/output/regenerate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ output_type: outputType, config }),
      })

      if (!response.ok) {
        const payload = await response.json().catch(() => ({}))
        throw new Error(payload.detail || 'Regeneration failed.')
      }

      const payload = await response.json()
      setOutputs((current) => ({ ...current, [outputType]: payload.output }))
      setValidation((current) => ({ ...current, [outputType]: payload.validation }))
      setActiveTab(outputType === 'linkedin' ? 'linkedin' : outputType === 'advisory' ? 'advisory' : 'summary')
    } catch (caughtError) {
      setError(caughtError instanceof Error ? caughtError.message : 'Unexpected regeneration error.')
    } finally {
      setIsProcessing(false)
      setProcessingStep(processingSteps.length - 1)
    }
  }

  const copyText = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text)
    } catch {
      setError('Clipboard access is not available in this browser context.')
    }
  }

  const renderOutputCard = (key: OutputKey, payload: Record<string, any>) => {
    if (!payload) return null

    return (
      <div className="output-container" key={key}>
        <div className="output-header">
          <h4>{key.replace('_', ' ')}</h4>
          <div className="output-actions">
            <button type="button" onClick={() => copyText(JSON.stringify(payload, null, 2))}>Copy</button>
            <button type="button" onClick={() => regenerateOutput(key)}>Regenerate</button>
          </div>
        </div>

        {validation[key] ? (
          <div className={`validation-badge ${validation[key].status}`}>
            {validation[key].status.toUpperCase()}
          </div>
        ) : null}

        <div className="content-block">
          {key === 'linkedin' ? (
            <>
              <p><strong>Hook:</strong> {payload.hook}</p>
              <p><strong>Post:</strong> {payload.post}</p>
              <p><strong>Call to action:</strong> {payload.call_to_action}</p>
              <p><strong>Hashtags:</strong> {(payload.hashtags || []).join(' ')}</p>
              <p><strong>Character count:</strong> {payload.character_count}</p>
            </>
          ) : (
            <>
              <p><strong>Title:</strong> {payload.title}</p>
              <p><strong>Summary:</strong> {payload.summary || payload.one_line_summary}</p>
              <p><strong>Situation:</strong> {payload.situation}</p>
              <p><strong>Key findings:</strong> {(payload.key_findings || payload.impact || []).join(' • ')}</p>
              <p><strong>Recommended actions:</strong> {(payload.recommended_actions || []).join(' • ')}</p>
            </>
          )}
        </div>

        {validation[key] && (
          <div className="validation-details">
            {validation[key].warnings.length > 0 ? (
              <div>
                <strong>Warnings</strong>
                <ul>{validation[key].warnings.map((item) => <li key={item}>{item}</li>)}</ul>
              </div>
            ) : null}
            {validation[key].errors.length > 0 ? (
              <div>
                <strong>Errors</strong>
                <ul>{validation[key].errors.map((item) => <li key={item}>{item}</li>)}</ul>
              </div>
            ) : null}
          </div>
        )}
      </div>
    )
  }

  const renderTabContent = () => {
    if (activeTab === 'source') {
      return (
        <div className="tab-panel">
          <h3>Source preview</h3>
          <pre>{sourceText || 'No source loaded yet.'}</pre>
          {brief ? (
            <div className="brief-card">
              <h4>Content brief</h4>
              <p><strong>Main topic:</strong> {String(brief.main_topic || '')}</p>
              <p><strong>Summary:</strong> {String(brief.summary || '')}</p>
              <p><strong>Key facts:</strong> {(brief.key_facts as string[] | undefined)?.join(' • ') || 'None'}</p>
            </div>
          ) : null}
        </div>
      )
    }

    if (activeTab === 'summary') {
      return <div className="tab-panel">{outputs.executive_summary ? renderOutputCard('executive_summary', outputs.executive_summary) : <p>No summary available yet.</p>}</div>
    }

    if (activeTab === 'advisory') {
      return <div className="tab-panel">{outputs.advisory ? renderOutputCard('advisory', outputs.advisory) : <p>No advisory available yet.</p>}</div>
    }

    return <div className="tab-panel">{outputs.linkedin ? renderOutputCard('linkedin', outputs.linkedin) : <p>No LinkedIn post available yet.</p>}</div>
  }

  return (
    <div className="app-shell">
      <header className="topbar">
        <div>
          <p className="eyebrow">CONTENTFORGE AI</p>
          <h1>Convert one source into coordinated communication outputs</h1>
        </div>
      </header>

      <main className="dashboard-grid">
        <section className="panel left-panel">
          <div className="panel-header">
            <h2>Dashboard</h2>
          </div>

          <form onSubmit={submitSource} className="source-form">
            <label className="field-label">Paste text</label>
            <textarea
              value={sourceText}
              onChange={(event) => setSourceText(event.target.value)}
              placeholder="Paste a source document, announcement, or briefing note here..."
              rows={10}
            />

            <label className="field-label">PDF upload</label>
            <input type="file" accept="application/pdf" onChange={handlePdfChange} />

            <div className="primary-actions">
              <button type="submit">Extract source</button>
              <button type="button" className="secondary" onClick={() => setSourceText('')}>Clear</button>
            </div>
          </form>

          <div className="options-grid">
            <label>
              <span>Audience</span>
              <input value={config.audience} onChange={(event) => updateConfig('audience', event.target.value)} />
            </label>
            <label>
              <span>Tone</span>
              <select value={config.tone} onChange={(event) => updateConfig('tone', event.target.value)}>
                <option value="professional">Professional</option>
                <option value="confident">Confident</option>
                <option value="concise">Concise</option>
                <option value="urgent">Urgent</option>
              </select>
            </label>
            <label>
              <span>Language</span>
              <input value={config.language} onChange={(event) => updateConfig('language', event.target.value)} />
            </label>
            <label>
              <span>Detail level</span>
              <select value={config.detail_level} onChange={(event) => updateConfig('detail_level', event.target.value)}>
                <option value="brief">Brief</option>
                <option value="moderate">Moderate</option>
                <option value="detailed">Detailed</option>
              </select>
            </label>
            <label className="full-width">
              <span>Communication objective</span>
              <input value={config.communication_objective} onChange={(event) => updateConfig('communication_objective', event.target.value)} />
            </label>
          </div>

          <div className="output-toggle-group">
            <span className="field-label">Outputs</span>
            {(['executive_summary', 'advisory', 'linkedin'] as OutputKey[]).map((outputKey) => (
              <label key={outputKey} className="toggle-chip">
                <input
                  type="checkbox"
                  checked={selectedOutputs.has(outputKey)}
                  onChange={() => toggleOutput(outputKey)}
                />
                <span>{outputKey.replace('_', ' ')}</span>
              </label>
            ))}
          </div>

          <button type="button" className="generate-button" onClick={runGeneration} disabled={isProcessing || !sourceText.trim()}>
            {isProcessing ? 'Processing…' : 'Generate'}
          </button>

          {error ? <div className="error-box">{error}</div> : null}
        </section>

        <section className="panel right-panel">
          <div className="panel-header">
            <h2>Processing</h2>
          </div>

          <div className="progress-steps">
            {processingSteps.map((step, index) => (
              <div key={step} className={`step ${index <= processingStep ? 'active' : ''}`}>
                <span>{index + 1}</span>
                <strong>{step}</strong>
              </div>
            ))}
          </div>

          <div className="meta-box">
            <h3>Source metadata</h3>
            <p>{sourceMeta.source_type ? `Type: ${String(sourceMeta.source_type)}` : 'No source uploaded yet.'}</p>
            <p>{sourceMeta.file_name ? `File: ${String(sourceMeta.file_name)}` : 'Text source ready.'}</p>
            <p>{sourceMeta.page_count ? `Pages: ${String(sourceMeta.page_count)}` : 'No page count available.'}</p>
          </div>
        </section>
      </main>

      <section className="results-panel panel">
        <div className="panel-header results-header">
          <h2>Results</h2>
          <div className="tab-list" role="tablist">
            {(['source', 'summary', 'advisory', 'linkedin'] as const).map((tab) => (
              <button key={tab} type="button" className={activeTab === tab ? 'active-tab' : ''} onClick={() => setActiveTab(tab)}>
                {tab === 'source' ? 'Source' : tab === 'summary' ? 'Summary' : tab === 'advisory' ? 'Advisory' : 'LinkedIn'}
              </button>
            ))}
          </div>
        </div>

        {renderTabContent()}
      </section>
    </div>
  )
}

export default App
