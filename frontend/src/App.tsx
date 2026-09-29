import { useMemo, useState } from 'react'
import type { ChangeEvent, FormEvent } from 'react'
import './App.css'

type OutputKey = 'executive_summary' | 'advisory' | 'linkedin' | 'x_post' | 'infographic' | 'presentation'
type ResultTab = 'source' | 'brief' | OutputKey
type ProcessingOperation = 'source' | 'generation' | 'regeneration'
type CopyFeedback = { outputType: OutputKey; status: 'copied' | 'failed' } | null
type OutputRecord = Record<string, unknown>

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
  output_types: ['executive_summary', 'advisory', 'linkedin', 'x_post', 'infographic', 'presentation'],
}

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:8000'
const processingSteps = ['Extracting source', 'Building Content Brief', 'Generating outputs', 'Validating']
const outputLabels: Record<OutputKey, string> = {
  executive_summary: 'Executive Summary',
  advisory: 'Advisory',
  linkedin: 'LinkedIn',
  x_post: 'X Post',
  infographic: 'Infographic',
  presentation: 'PowerPoint',
}
const outputFieldLabels: Record<string, string> = {
  title: 'Title',
  one_line_summary: 'One-line summary',
  situation: 'Situation',
  key_findings: 'Key findings',
  impact: 'Impact',
  risks: 'Risks',
  recommended_actions: 'Recommended actions',
  uncertainties: 'Uncertainties',
  source_references: 'Source references',
  severity: 'Severity',
  date: 'Date',
  summary: 'Summary',
  affected_entities: 'Affected entities',
  mitigation: 'Mitigation',
  references: 'References',
  disclaimer: 'Disclaimer',
  hook: 'Hook',
  post: 'Post',
  call_to_action: 'Call to action',
  hashtags: 'Hashtags',
  alternative_hooks: 'Alternative hooks',
  character_count: 'Character count',
  subtitle: 'Subtitle',
  key_stat: 'Key statistic',
  sections: 'Sections (JSON)',
  key_message: 'Key message',
  footer: 'Footer',
  slides: 'Slides',
  main_topic: 'Main topic',
  key_facts: 'Key facts',
  dates: 'Dates',
  entities: 'Entities',
  evidence_references: 'Source references',
}

const outputFieldConfig: Record<OutputKey, string[]> = {
  executive_summary: ['title', 'one_line_summary', 'situation', 'key_findings', 'impact', 'risks', 'recommended_actions', 'uncertainties', 'source_references'],
  advisory: ['title', 'severity', 'date', 'summary', 'affected_entities', 'situation', 'impact', 'recommended_actions', 'mitigation', 'references', 'disclaimer'],
  linkedin: ['hook', 'post', 'call_to_action', 'hashtags', 'alternative_hooks', 'character_count'],
  x_post: ['hook', 'post', 'call_to_action', 'hashtags', 'character_count'],
  infographic: ['title', 'subtitle', 'key_stat', 'sections', 'key_message', 'recommended_actions', 'footer'],
  presentation: [],
}

const escapeHtml = (value: unknown) => String(value ?? '').replace(/[&<>"']/g, (character) => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
})[character] || character)

const downloadBlob = (blob: Blob, filename: string) => {
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  link.click()
  URL.revokeObjectURL(url)
}

const buildInfographicHtml = (output: OutputRecord) => {
  const sections = (Array.isArray(output.sections) ? output.sections : []).map((section: Record<string, unknown>) => `
    <article><h2>${escapeHtml(section.heading)}</h2><strong>${escapeHtml(section.value)}</strong><p>${escapeHtml(section.description)}</p></article>`).join('')
  const actions = (Array.isArray(output.recommended_actions) ? output.recommended_actions : []).map((action: unknown) => `<li>${escapeHtml(action)}</li>`).join('')
  return `<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>${escapeHtml(output.title)}</title><style>
    *{box-sizing:border-box}body{margin:0;background:#edf2ee;color:#172c2a;font:16px/1.55 Georgia,serif}.sheet{max-width:1000px;margin:32px auto;padding:48px;background:#fff;border-top:9px solid #196358}.kicker{font:700 12px Arial,sans-serif;letter-spacing:2px;color:#196358}h1{font-size:40px;line-height:1.1;margin:8px 0}header>p{color:#536560;font-size:18px}.stat{margin:28px 0;background:#e8f1ed;padding:24px;border-left:5px solid #196358}.stat strong{font:700 34px Arial,sans-serif;color:#196358}.grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:14px}.grid article{border:1px solid #d8e1dc;padding:18px}.grid h2{font:700 17px Arial,sans-serif;margin:0 0 10px}.grid strong{font-size:20px}.grid p,footer{color:#536560}h3{margin-top:30px}@media(max-width:640px){.sheet{margin:0;padding:24px}.grid{grid-template-columns:1fr}h1{font-size:32px}}@media print{body{background:#fff}.sheet{margin:0;max-width:none}}
    </style><main class="sheet"><header><span class="kicker">CONTENTFORGE · EVIDENCE BRIEF</span><h1>${escapeHtml(output.title)}</h1><p>${escapeHtml(output.subtitle)}</p></header><section class="stat"><span class="kicker">KEY STAT / FINDING</span><br><strong>${escapeHtml(output.key_stat)}</strong></section><section class="grid">${sections}</section><h3>${escapeHtml(output.key_message)}</h3><ul>${actions}</ul><footer>${escapeHtml(output.footer)}</footer></main></html>`
}

const cloneValue = <T,>(value: T): T => JSON.parse(JSON.stringify(value ?? {}))

function App() {
  const [sourceText, setSourceText] = useState('')
  const [pdfFile, setPdfFile] = useState<File | null>(null)
  const [config, setConfig] = useState<AppConfig>(defaultConfig)
  const [processingStep, setProcessingStep] = useState(0)
  const [isProcessing, setIsProcessing] = useState(false)
  const [processingOperation, setProcessingOperation] = useState<ProcessingOperation | null>(null)
  const [failedOperation, setFailedOperation] = useState<ProcessingOperation | null>(null)
  const [activeTab, setActiveTab] = useState<ResultTab>('source')
  const [sourceMeta, setSourceMeta] = useState<Record<string, unknown>>({})
  const [brief, setBrief] = useState<OutputRecord | null>(null)
  const [outputs, setOutputs] = useState<Record<string, OutputRecord>>({})
  const [validation, setValidation] = useState<Record<string, ValidationState>>({})
  const [editing, setEditing] = useState<Record<string, OutputRecord>>({})
  const [generationMode, setGenerationMode] = useState('fallback')
  const [error, setError] = useState('')
  const [copyFeedback, setCopyFeedback] = useState<CopyFeedback>(null)
  const [regeneratingOutput, setRegeneratingOutput] = useState<OutputKey | null>(null)
  const [isDownloadingPresentation, setIsDownloadingPresentation] = useState(false)

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

  const clearGeneratedResults = () => {
    setBrief(null)
    setOutputs({})
    setValidation({})
    setEditing({})
    setActiveTab('source')
  }

  const handleSourceTextChange = (value: string) => {
    setSourceText(value)
    setSourceMeta({})
    setError('')
    setFailedOperation(null)
    clearGeneratedResults()
  }

  const handlePdfChange = (event: ChangeEvent<HTMLInputElement>) => {
    const nextFile = event.target.files?.[0] ?? null
    if (nextFile && !nextFile.name.toLowerCase().endsWith('.pdf')) {
      setError('Only PDF files are supported for upload.')
      setPdfFile(null)
      return
    }
    setPdfFile(nextFile)
    setSourceMeta({})
    setError('')
    setFailedOperation(null)
    clearGeneratedResults()
  }

  const submitSource = async (event?: FormEvent) => {
    event?.preventDefault()
    setError('')
    setFailedOperation(null)
    setProcessingStep(0)
    setIsProcessing(true)
    setProcessingOperation('source')
    clearGeneratedResults()

    const formData = new FormData()
    if (pdfFile) {
      if (!pdfFile.name.toLowerCase().endsWith('.pdf')) {
        setError('Please upload a valid PDF file.')
        setIsProcessing(false)
        setProcessingOperation(null)
        return
      }
      formData.append('file', pdfFile)
    } else if (sourceText.trim()) {
      formData.append('text', sourceText)
    } else {
      setError('Paste text or upload a PDF before continuing.')
      setIsProcessing(false)
      setProcessingOperation(null)
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
      if (!payload || typeof payload !== 'object') {
        throw new Error('The source endpoint returned a malformed response.')
      }

      setSourceText(payload.text || sourceText)
      setSourceMeta(payload.metadata || {})
      setBrief(null)
      setOutputs({})
      setValidation({})
      setEditing({})
      setActiveTab('source')
      setProcessingStep(1)
    } catch (caughtError) {
      setError(caughtError instanceof Error ? caughtError.message : 'Source upload failed.')
      setFailedOperation('source')
    } finally {
      setIsProcessing(false)
      setProcessingOperation(null)
    }
  }

  const runGeneration = async () => {
    if (!sourceText.trim()) {
      setError('Paste text or upload a PDF before generating output.')
      return
    }

    setError('')
    setFailedOperation(null)
    setIsProcessing(true)
    setProcessingStep(0)
    setProcessingOperation('generation')

    try {
      setProcessingStep(1)
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
      if (!payload || typeof payload !== 'object' || !payload.brief || typeof payload.outputs !== 'object') {
        throw new Error('The backend returned a malformed generation response.')
      }

      setProcessingStep(2)
      setBrief(payload.brief || null)
      setOutputs(payload.outputs || {})
      setValidation(payload.validation || {})
      setGenerationMode(payload.generation_mode || 'fallback')
      setSourceMeta(payload.source_metadata || sourceMeta)
      setEditing({})
      setActiveTab('brief')
      setProcessingStep(3)
    } catch (caughtError) {
      setError(caughtError instanceof Error ? caughtError.message : 'Unexpected generation error.')
      setFailedOperation('generation')
      setProcessingStep(0)
    } finally {
      setIsProcessing(false)
      setProcessingOperation(null)
    }
  }

  const regenerateOutput = async (outputType: OutputKey) => {
  if (!brief) {
    setError('Generate the Content Brief before regenerating an output.')
    return
  }

  setError('')
  setFailedOperation(null)
  setIsProcessing(true)
  setProcessingStep(0)
  setProcessingOperation('regeneration')
  setRegeneratingOutput(outputType)

  try {
    setProcessingStep(1)

    const response = await fetch(`${API_URL}/api/output/regenerate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        output_type: outputType,
        config,
        brief,
      }),
    })

    if (!response.ok) {
      const payload = await response.json().catch(() => ({}))
      throw new Error(payload.detail || 'Regeneration failed.')
    }

    const payload = await response.json()

    if (!payload || typeof payload !== 'object' || !payload.output) {
      throw new Error('The regeneration endpoint returned an unexpected payload.')
    }

    setProcessingStep(2)

    setOutputs((current) => ({
      ...current,
      [outputType]: payload.output,
    }))

    setValidation((current) => ({
      ...current,
      [outputType]: payload.validation,
    }))

    setEditing((current) => {
      const next = { ...current }
      delete next[outputType]
      return next
    })

    setActiveTab(outputType)
    setProcessingStep(3)
  } catch (caughtError) {
    setError(
      caughtError instanceof Error
        ? caughtError.message
        : 'Unexpected regeneration error.'
    )
    setFailedOperation('regeneration')
    setProcessingStep(0)
  } finally {
    setIsProcessing(false)
    setProcessingOperation(null)
    setRegeneratingOutput(null)
  }
}
 
 
  const copyOutput = async (outputType: OutputKey, payload: OutputRecord) => {
    try {
      await navigator.clipboard.writeText(flattenOutput(payload))
      setCopyFeedback({ outputType, status: 'copied' })
    } catch {
      setCopyFeedback({ outputType, status: 'failed' })
    }
    window.setTimeout(() => {
      setCopyFeedback((current) => current?.outputType === outputType ? null : current)
    }, 1800)
  }

  const downloadInfographic = (payload: OutputRecord) => {
    const filename = String(payload.title || 'contentforge-infographic').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')
    downloadBlob(new Blob([buildInfographicHtml(payload)], { type: 'text/html;charset=utf-8' }), `${filename || 'contentforge-infographic'}.html`)
  }

  const downloadPresentation = async (payload: OutputRecord) => {
    if (!brief) return
    setError('')
    setIsDownloadingPresentation(true)
    try {
      const response = await fetch(`${API_URL}/api/output/presentation/download`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ output: payload, brief }),
      })
      if (!response.ok) {
        const result = await response.json().catch(() => ({}))
        throw new Error(result.detail || 'PowerPoint download failed.')
      }
      const filename = String(payload.title || 'contentforge-presentation').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')
      downloadBlob(await response.blob(), `${filename || 'contentforge-presentation'}.pptx`)
    } catch (caughtError) {
      setError(caughtError instanceof Error ? caughtError.message : 'PowerPoint download failed.')
    } finally {
      setIsDownloadingPresentation(false)
    }
  }

  const flattenOutput = (payload: OutputRecord) => {
    const relevantFields = Object.entries(payload)
      .filter(([key]) => key !== 'character_count')
      .map(([key, value]) => {
        if (Array.isArray(value)) {
          return `${outputFieldLabels[key] || key}: ${value.map((item) => typeof item === 'object' ? JSON.stringify(item) : String(item)).join(' • ')}`
        }
        if (typeof value === 'object' && value !== null) {
          return `${outputFieldLabels[key] || key}: ${JSON.stringify(value)}`
        }
        return `${outputFieldLabels[key] || key}: ${String(value)}`
      })
      .join('\n')

    return `${relevantFields}${payload.character_count ? `\nCharacter count: ${String(payload.character_count)}` : ''}`
  }

  const startEditingOutput = (outputType: OutputKey) => {
    const current = outputs[outputType]
    if (!current) return
    setEditing((value) => ({ ...value, [outputType]: cloneValue(current) }))
  }

  const cancelEditingOutput = (outputType: OutputKey) => {
    setEditing((value) => {
      const next = { ...value }
      delete next[outputType]
      return next
    })
  }

  const updateEditedField = (outputType: OutputKey, field: string, rawValue: string) => {
    setEditing((current) => ({
      ...current,
      [outputType]: {
        ...current[outputType],
        [field]: rawValue,
      },
    }))
  }

  const saveEditedOutput = (outputType: OutputKey) => {
    const edited = editing[outputType]
    if (!edited) return

    const base = outputs[outputType] || {}
    const nextValue = { ...base }

    for (const field of outputFieldConfig[outputType] ?? []) {
      const editedFieldValue = edited[field]
      if (outputType === 'infographic' && field === 'sections' && typeof editedFieldValue === 'string') {
        try {
          nextValue[field] = JSON.parse(editedFieldValue)
        } catch {
          setError('Sections must be valid JSON before saving.')
          return
        }
      } else if (Array.isArray(base[field])) {
        nextValue[field] = typeof editedFieldValue === 'string'
          ? editedFieldValue
              .split(/\n|•/)
              .map((item) => item.trim())
              .filter(Boolean)
          : []
      } else if (typeof base[field] === 'number') {
        nextValue[field] = Number(editedFieldValue ?? 0) || 0
      } else {
        nextValue[field] = typeof editedFieldValue === 'string' ? editedFieldValue : base[field]
      }
    }

    if (outputType === 'x_post') {
      const hashtags = Array.isArray(nextValue.hashtags) ? nextValue.hashtags.map(String).join(' ') : ''
      nextValue.character_count = [nextValue.hook, nextValue.post, nextValue.call_to_action, hashtags].map(String).join('\n\n').trim().length
    }

    setOutputs((current) => ({ ...current, [outputType]: nextValue }))
    cancelEditingOutput(outputType)
  }

  const renderArrayField = (name: string, values: unknown[]) => (
    <div className="data-row" key={name}>
      <dt>{outputFieldLabels[name] || name}</dt>
      <dd>{Array.isArray(values) ? values.map((item) => typeof item === 'object' ? JSON.stringify(item) : String(item)).join(' • ') : String(values)}</dd>
    </div>
  )

  const renderValidationPanel = (outputType: OutputKey) => {
    const current = validation[outputType]
    if (!current) return null

    return (
      <div className={`validation-panel ${current.status}`}>
        <div className="validation-heading">
          <span className="validation-status">{current.status.toUpperCase()}</span>
          <span className="validation-title">Validation</span>
        </div>

        {current.warnings.length > 0 ? (
          <div className="validation-block warning-block">
            <h4>Warnings</h4>
            <ul>
              {current.warnings.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
          </div>
        ) : null}

        {current.errors.length > 0 ? (
          <div className="validation-block error-block">
            <h4>Errors</h4>
            <ul>
              {current.errors.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
          </div>
        ) : null}

        {current.deterministic_checks?.length ? (
          <div className="validation-block info-block">
            <h4>Automated checks</h4>
            <ul>
              {current.deterministic_checks.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
          </div>
        ) : null}
      </div>
    )
  }

  const renderOutputCard = (outputType: OutputKey) => {
    const payload = outputs[outputType]
    const currentValidation = validation[outputType]
    const isEditing = Boolean(editing[outputType])
    const edited = editing[outputType] || payload || {}

    if (!payload) return null

    const references = [payload.source_references, payload.references, brief?.evidence_references].find(Array.isArray) as unknown[] | undefined || []

    return (
      <div className="output-card" key={outputType}>
        <div className="output-head">
          <div>
            <p className="eyebrow subtle">OUTPUT</p>
            <h3>{outputLabels[outputType]}</h3>
          </div>
          <div className="output-actions">
            <button type="button" className="secondary" onClick={() => copyOutput(outputType, edited)}>
              {copyFeedback?.outputType === outputType && copyFeedback.status === 'copied' ? 'Copied' : 'Copy'}
            </button>
            <button type="button" className="secondary" onClick={() => regenerateOutput(outputType)} disabled={isProcessing}>
              {regeneratingOutput === outputType ? 'Regenerating…' : 'Regenerate'}
            </button>
            {outputType === 'infographic' ? <button type="button" className="secondary" onClick={() => downloadInfographic(edited)}>Download HTML</button> : null}
            {outputType === 'presentation' ? <button type="button" className="secondary" onClick={() => void downloadPresentation(edited)} disabled={isDownloadingPresentation}>{isDownloadingPresentation ? 'Preparing…' : 'Download .pptx'}</button> : null}
            {copyFeedback?.outputType === outputType && copyFeedback.status === 'failed' ? (
              <span className="copy-feedback error" role="status">Copy unavailable</span>
            ) : null}
            {copyFeedback?.outputType === outputType && copyFeedback.status === 'copied' ? (
              <span className="copy-feedback" role="status">Copied to clipboard</span>
            ) : null}
            {!isEditing && outputFieldConfig[outputType]?.length ? (
              <button type="button" onClick={() => startEditingOutput(outputType)}>Edit</button>
            ) : isEditing ? (
              <>
                <button type="button" onClick={() => saveEditedOutput(outputType)}>Save</button>
                <button type="button" className="secondary" onClick={() => cancelEditingOutput(outputType)}>Cancel</button>
              </>
            ) : null}
          </div>
        </div>

        {currentValidation ? (
          <div className={`validation-badge ${currentValidation.status}`}>
            {currentValidation.status.toUpperCase()}
          </div>
        ) : null}

        <div className="editor-block">
          {isEditing ? (
            <div className="editor-grid">
              {outputFieldConfig[outputType]?.map((field) => {
                const value = edited[field]
                const fieldValue = field === 'sections' && outputType === 'infographic'
                  ? JSON.stringify(value ?? [], null, 2)
                  : Array.isArray(value) ? value.join('\n') : typeof value === 'number' ? String(value) : String(value ?? '')

                return (
                  <label key={field} className="editor-field">
                    <span>{outputFieldLabels[field] || field}</span>
                    <textarea value={fieldValue} onChange={(event) => updateEditedField(outputType, field, event.target.value)} rows={field === 'post' || field === 'situation' ? 6 : 3} />
                  </label>
                )
              })}
            </div>
          ) : outputType === 'infographic' ? (
              <div className="infographic-preview">
                <header className="infographic-header">
                  <p className="eyebrow subtle">CONTENT BRIEF · VISUAL SUMMARY</p>
                  <h2>{String(payload.title ?? '')}</h2>
                  <p>{String(payload.subtitle ?? '')}</p>
                </header>
                <div className="infographic-stat"><span>KEY STAT / FINDING</span><strong>{String(payload.key_stat ?? '')}</strong></div>
                <div className="infographic-sections">
                  {(Array.isArray(payload.sections) ? payload.sections : []).map((section: OutputRecord, index: number) => (
                    <article key={`${section.heading}-${index}`}>
                      <h4>{String(section.heading ?? '')}</h4><strong>{String(section.value ?? '')}</strong><p>{String(section.description ?? '')}</p>
                    </article>
                  ))}
                </div>
                <div className="infographic-actions"><h4>{String(payload.key_message ?? '')}</h4><ul>{(Array.isArray(payload.recommended_actions) ? payload.recommended_actions : []).map((action, index) => <li key={`${String(action)}-${index}`}>{String(action)}</li>)}</ul></div>
                <p className="infographic-footer">{String(payload.footer ?? '')}</p>
              </div>
            ) : outputType === 'presentation' ? (
              <div className="slide-preview">
                <div className="slide-deck-heading"><span>{(Array.isArray(payload.slides) ? payload.slides : []).length} SLIDES</span><h2>{String(payload.title ?? '')}</h2><p>{String(payload.subtitle ?? '')}</p></div>
                {(Array.isArray(payload.slides) ? payload.slides : []).map((slide: OutputRecord, index: number) => (
                  <article key={`${String(slide.slide_number)}-${String(slide.title)}`}>
                    <span>SLIDE {String(slide.slide_number || index + 1)}</span><h4>{String(slide.title ?? '')}</h4>
                    <ul>{(Array.isArray(slide.content) ? slide.content : []).map((line, lineIndex) => <li key={`${String(line)}-${lineIndex}`}>{String(line)}</li>)}</ul>
                  </article>
                ))}
              </div>
            ) : outputType === 'x_post' ? (
              <div className="x-post-preview">
                <p className="x-post-hook">{String(payload.hook ?? '')}</p><p>{String(payload.post ?? '')}</p>
                <p>{String(payload.call_to_action ?? '')}</p><strong>{(Array.isArray(payload.hashtags) ? payload.hashtags : []).map(String).join(' ')}</strong>
                <span>{String(payload.character_count ?? 0)} characters</span>
              </div>
            ) : (
            <dl className="output-details">
              {Object.entries(payload).map(([field, value]) => {
                if (field === 'character_count') {
                  return (
                    <div className="data-row" key={field}>
                      <dt>{outputFieldLabels[field] || field}</dt>
                      <dd>{String(value)}</dd>
                    </div>
                  )
                }

                if (Array.isArray(value)) {
                  return renderArrayField(field, value)
                }

                if (typeof value === 'object' && value !== null) {
                  return (
                    <div className="data-row multiline" key={field}>
                      <dt>{outputFieldLabels[field] || field}</dt>
                      <dd>{JSON.stringify(value, null, 2)}</dd>
                    </div>
                  )
                }

                if (typeof value === 'string' && value.length > 160) {
                  return (
                    <div className="data-row multiline" key={field}>
                      <dt>{outputFieldLabels[field] || field}</dt>
                      <dd>{value}</dd>
                    </div>
                  )
                }

                return (
                  <div className="data-row" key={field}>
                    <dt>{outputFieldLabels[field] || field}</dt>
                    <dd>{String(value ?? '')}</dd>
                  </div>
                )
              })}
            </dl>
          )}
        </div>

        {references.length > 0 ? (
          <div className="reference-block">
            <h4>Source references</h4>
            <ul>
              {references.map((item: unknown) => (
                <li key={String(item)}>{String(item)}</li>
              ))}
            </ul>
          </div>
        ) : null}

        <div className="edit-note">Edits affect only this output and do not change the generated Content Brief unless you regenerate it.</div>
        {renderValidationPanel(outputType)}
      </div>
    )
  }

  const renderBriefTab = () => {
    if (!brief) {
      return <div className="empty-state">Generate a brief to view the structured source analysis.</div>
    }

    const briefFields = [
      ['main_topic', brief.main_topic],
      ['summary', brief.summary],
      ['key_facts', brief.key_facts],
      ['dates', brief.dates],
      ['entities', brief.entities],
      ['impact', brief.impact],
      ['risks', brief.risks],
      ['recommended_actions', brief.recommended_actions],
      ['uncertainties', brief.uncertainties],
      ['evidence_references', brief.evidence_references],
    ] as const

    return (
      <div className="tab-panel brief-tab">
        <div className="brief-header">
          <div>
            <p className="eyebrow subtle">SOURCE-TO-BRIEF</p>
            <h3>{String(brief.main_topic || 'Untitled brief')}</h3>
          </div>
          <span className="generation-mode">Generation: {generationMode}</span>
        </div>

        <div className="brief-grid">
          {briefFields.map(([field, value]) => (
            <div key={field} className="brief-item">
              <h4>{outputFieldLabels[field] || field}</h4>
              {Array.isArray(value) ? (
                <ul>
                  {value.map((item) => (
                    <li key={String(item)}>{String(item)}</li>
                  ))}
                </ul>
              ) : (
                <p>{String(value ?? '')}</p>
              )}
            </div>
          ))}
        </div>
      </div>
    )
  }

  const renderSourceTab = () => (
    <div className="tab-panel source-tab">
      <div className="source-overview">
        <div>
          <h3>Source text</h3>
          <pre>{sourceText || 'No source loaded yet.'}</pre>
        </div>
        <div className="source-meta-box">
          <h4>Source metadata</h4>
          <ul>
            <li><strong>Type:</strong> {String(sourceMeta.source_type || 'Not available')}</li>
            <li><strong>File:</strong> {String(sourceMeta.file_name || 'Pasted text')}</li>
            <li><strong>Pages:</strong> {String(sourceMeta.page_count || 'N/A')}</li>
          </ul>
        </div>
      </div>
    </div>
  )

  const renderTabContent = () => {
    if (activeTab === 'source') return renderSourceTab()
    if (activeTab === 'brief') return renderBriefTab()
    return <div className="tab-panel">{renderOutputCard(activeTab)}</div>
  }

  const outputCount = Object.keys(outputs).length
  const selectedPdfNeedsExtraction = Boolean(pdfFile && sourceMeta.file_name !== pdfFile.name)
  const liveSourceStatus = processingOperation === 'source'
    ? 'Extracting source…'
    : processingOperation === 'generation'
      ? 'Processing source…'
      : failedOperation === 'source'
        ? 'Extraction failed'
        : selectedPdfNeedsExtraction
          ? 'PDF selected'
          : sourceText.trim()
            ? 'Ready'
            : 'Waiting for source'
  const liveBriefStatus = processingOperation === 'generation'
    ? 'Preparing Content Brief…'
    : failedOperation === 'generation'
      ? 'Generation failed'
      : brief
        ? 'Prepared'
        : 'Not prepared'
  const liveOutputsStatus = processingOperation === 'generation'
    ? 'Generating outputs…'
    : processingOperation === 'regeneration'
      ? `Regenerating output (${outputCount} generated)`
      : failedOperation === 'generation'
        ? outputCount > 0
          ? `Generation failed (${outputCount} previous outputs retained)`
          : 'Generation failed'
        : failedOperation === 'regeneration'
          ? `Regeneration failed (${outputCount} outputs retained)`
          : `${outputCount} generated`

  return (
    <div className="app-shell">
      <header className="topbar">
        <div>
          <p className="eyebrow">CONTENTFORGE AI</p>
          <h1>ContentForge Results Workspace</h1>
        </div>
      </header>

      <main className="dashboard-grid">
        <section className="panel left-panel">
          <div className="panel-header">
            <h2>Dashboard</h2>
          </div>

          <form onSubmit={submitSource} className="source-form">
            <label className="field-label">Paste source text</label>
            <textarea
              value={sourceText}
              onChange={(event) => handleSourceTextChange(event.target.value)}
              placeholder="Paste a document excerpt, announcement, briefing note, or customer update..."
              rows={10}
              disabled={isProcessing}
            />

            <label className="field-label">Upload PDF</label>
            <input type="file" accept="application/pdf" onChange={handlePdfChange} disabled={isProcessing} />

            <div className="primary-actions">
              <button type="submit" disabled={isProcessing}>Extract source</button>
              <button type="button" className="secondary" onClick={() => handleSourceTextChange('')} disabled={isProcessing}>Clear</button>
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
            {(Object.keys(outputLabels) as OutputKey[]).map((outputKey) => (
              <label key={outputKey} className="toggle-chip">
                <input
                  type="checkbox"
                  checked={selectedOutputs.has(outputKey)}
                  onChange={() => toggleOutput(outputKey)}
                />
                <span>{outputLabels[outputKey]}</span>
              </label>
            ))}
          </div>

          <button type="button" className="generate-button" onClick={runGeneration} disabled={isProcessing || !sourceText.trim() || selectedPdfNeedsExtraction}>
            {isProcessing ? 'Processing…' : 'Generate'}
          </button>

          {error ? <div className="error-box">{error}</div> : null}
        </section>

        <section className="panel right-panel">
          <div className="panel-header">
            <h2>Processing</h2>
          </div>

          <div className="progress-steps" aria-live="polite">
            {processingSteps.map((step, index) => (
              <div key={step} className={`step ${index <= processingStep ? 'active' : ''}`}>
                <span>{index + 1}</span>
                <strong>{step}</strong>
              </div>
            ))}
          </div>

          <div className="meta-box">
            <h3>Live status</h3>
            <p><strong>Source:</strong> {liveSourceStatus}</p>
            <p><strong>Brief:</strong> {liveBriefStatus}</p>
            <p><strong>Outputs:</strong> {liveOutputsStatus}</p>
          </div>
        </section>
      </main>

      <section className="results-panel panel">
        <div className="panel-header results-header">
          <h2>Results Workspace</h2>
          <div className="tab-list" role="tablist" aria-label="results tabs">
            {(['source', 'brief', ...Object.keys(outputLabels)] as ResultTab[]).map((tab) => (
              <button key={tab} type="button" className={activeTab === tab ? 'active-tab' : ''} onClick={() => setActiveTab(tab)}>
                {tab === 'source' ? 'Source' : tab === 'brief' ? 'Content Brief' : outputLabels[tab]}
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
