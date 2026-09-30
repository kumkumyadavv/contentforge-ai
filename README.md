# ContentForge AI

AI-powered content transformation platform that converts a single source of information into multiple evidence-grounded communication formats such as summaries, advisories, social media posts, presentations, and infographics.

## 📌 Overview

Organizations often need to transform the same information into different communication formats. Doing this manually is time-consuming and can introduce inconsistencies between outputs.

**ContentForge AI** solves this by first converting the source into an **evidence-grounded Content Brief** that acts as a single source of truth. Multiple communication formats are then generated from this shared knowledge layer.

### Who is it for?

* Organizations and communication teams
* Security and incident-response teams
* Content and social-media teams
* Researchers and analysts
* Teams that need to transform information into multiple communication artifacts

### Main Purpose

To transform one source of information into multiple consistent, editable, and validated communication outputs using AI.

## ✨ Features

* 📄 Paste text or upload PDF documents
* 🧠 AI-powered Content Brief generation
* 🔍 Evidence-grounded content transformation
* 📝 Executive Summary generation
* 🚨 Advisory generation
* 💼 LinkedIn Post generation
* 🐦 X / Twitter Post generation
* 📊 Infographic generation
* 📑 PowerPoint presentation generation
* ✏️ Edit generated outputs
* 🔄 Regenerate individual outputs
* 📋 Copy generated content
* ⬇️ Download generated artifacts
* ✅ AI-assisted content validation
* ⚠️ Uncertainty and fact-preservation checks
* 📚 Source references
* ⚡ Real-time generation status and processing stages
* 🔁 Fallback handling when the LLM is unavailable

## 🏗️ How It Works

```text
User
  ↓
Frontend
  ↓
FastAPI API
  ↓
Source Extraction
  ↓
Gemini AI
  ↓
Evidence-Grounded Content Brief
  ↓
┌──────────────┬──────────────┬──────────────┬──────────────┐
│   Summary    │   Advisory   │   LinkedIn   │    X Post    │
├──────────────┼──────────────┼──────────────┼──────────────┤
│     PPT      │  Infographic │              │              │
└──────────────┴──────────────┴──────────────┴──────────────┘
  ↓
Validation
  ↓
Edit / Regenerate
  ↓
Copy / Download
```

### Example Flow

1. User pastes source text or uploads a PDF.
2. Backend extracts and normalizes the source content.
3. Gemini analyzes the source.
4. An evidence-grounded Content Brief is created.
5. The Content Brief becomes the single source of truth.
6. Multiple communication formats are generated from the same brief.
7. Generated outputs are validated for important facts, dates, numbers, entities, and uncertainty.
8. User can edit or regenerate individual outputs.
9. User can copy or download the generated artifacts.

## 🛠️ Tech Stack

### Frontend

* React
* TypeScript
* Vite
* Tailwind CSS

### Backend

* Python
* FastAPI
* Pydantic
* PyMuPDF

### AI

* Google Gemini API
* Structured JSON generation

### Other

* python-pptx
* SQLite
* Pytest
* REST API

## 📁 Project Structure

```text
contentforge/
├── frontend/
│   ├── src/
│   │   ├── App.tsx
│   │   ├── App.css
│   │   └── ...
│   ├── public/
│   └── package.json
│
├── backend/
│   ├── app/
│   │   ├── main.py
│   │   ├── config.py
│   │   ├── llm_client.py
│   │   ├── brief.py
│   │   ├── validation.py
│   │   └── ...
│   │
│   ├── tests/
│   │   └── test_app.py
│   │
│   ├── requirements.txt
│   └── .venv/
│
├── .env.example
├── .gitignore
├── package.json
└── README.md
```

## ⚙️ Setup

### 1. Clone the Repository

```bash
git clone https://github.com/<your-username>/contentforge.git
cd contentforge
```

### 2. Backend Setup

```bash
cd backend
python -m venv .venv
```

#### Windows

```powershell
.venv\Scripts\activate
```

#### macOS / Linux

```bash
source .venv/bin/activate
```

Install dependencies:

```bash
pip install -r requirements.txt
```

### 3. Configure Environment Variables

Create a `.env` file in the project root:

```env
GEMINI_API_KEY=your_gemini_api_key
GEMINI_MODEL=gemini-2.5-flash
BACKEND_URL=http://localhost:8000
```

**Do not commit your `.env` file or expose your API key.**

### 4. Start Backend

From the `backend` directory:

```bash
uvicorn app.main:app --reload
```

Backend:

```text
http://localhost:8000
```

API documentation:

```text
http://localhost:8000/docs
```

### 5. Start Frontend

Open a new terminal:

```bash
cd contentforge
npm install
npm run dev
```

Open the Vite URL shown in the terminal, usually:

```text
http://localhost:5173
```

## 🧪 Testing

Run backend tests:

```bash
cd backend
pytest
```

Build the frontend:

```bash
npm run build
```

## 🔌 API Endpoints

```text
GET  /health
POST /api/source
POST /api/generate
POST /api/output/regenerate
```

## 💡 Core Innovation

ContentForge does not independently generate every output directly from the raw source.

Instead:

```text
Source
   ↓
Evidence-Grounded Content Brief
   ↓
Single Source of Truth
   ↓
Multiple Communication Formats
```

This helps maintain consistency across different outputs and reduces the risk of changing important facts or uncertainties during transformation.

## 🔮 Future Scope

* AI-generated video
* Additional document formats
* Advanced citation tracking
* OCR for scanned documents
* More infographic and presentation templates
* Multi-language content generation
* Human approval workflows
* Collaborative editing
* Advanced fact-checking
* Automated publishing integrations

```
```
