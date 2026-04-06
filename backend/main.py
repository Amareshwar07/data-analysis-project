"""
FastAPI Backend - Data Visualization App
Phase 1: CSV upload, validation, data preview.
Phase 2: Column type detection + smart chart suggestions.
"""

import io
import os
import logging
from itertools import combinations
from typing import Literal

from dotenv import load_dotenv
import pandas as pd
from fastapi import FastAPI, File, UploadFile, HTTPException
from fastapi.middleware.cors import CORSMiddleware

# Load environment variables from .env if present
load_dotenv()

# Setup basic application logging
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s - %(name)s - %(levelname)s - %(message)s",
)
logger = logging.getLogger(__name__)

# ─────────────────────────────────────────────
# App Initialization
# ─────────────────────────────────────────────
app = FastAPI(
    title="Data Visualization API",
    description="Upload CSV files and get data previews for visualization.",
    version="1.0.0",
)

# Allow React frontend (default to local dev port 5173)
FRONTEND_URL = os.getenv("FRONTEND_URL", "http://localhost:5173")
allow_origins = [FRONTEND_URL, "http://127.0.0.1:5173", "http://localhost:5173"]

app.add_middleware(
    CORSMiddleware,
    allow_origins=allow_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# ─────────────────────────────────────────────
# Root Health Check
# ─────────────────────────────────────────────
@app.get("/")
def read_root():
    """Health check endpoint."""
    return {"status": "ok", "message": "Data Visualization API is running."}


# ─────────────────────────────────────────────
# CSV Upload Endpoint
# ─────────────────────────────────────────────
@app.post("/upload")
async def upload_csv(file: UploadFile = File(...)):
    """
    Upload a CSV file and receive:
    - columns: list of column names
    - dtypes: data type of each column
    - preview: first 10 rows as list of dicts
    - row_count: total number of rows
    """

    # 1. Validate file extension
    if not file.filename.endswith(".csv"):
        raise HTTPException(
            status_code=400,
            detail="Invalid file type. Only CSV (.csv) files are accepted.",
        )

    try:
        # 2. Read file bytes into memory
        contents = await file.read()

        if not contents:
            raise HTTPException(
                status_code=400,
                detail="The uploaded file is empty. Please upload a valid CSV file.",
            )

        # 3. Parse CSV with pandas
        df = pd.read_csv(io.BytesIO(contents))

    except pd.errors.EmptyDataError:
        raise HTTPException(
            status_code=400,
            detail="The CSV file has no data or columns.",
        )
    except pd.errors.ParserError as e:
        raise HTTPException(
            status_code=400,
            detail=f"Failed to parse CSV file: {str(e)}",
        )
    except HTTPException:
        # Re-raise HTTP exceptions (our own validations above)
        raise
    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail=f"An unexpected error occurred while reading the file: {str(e)}",
        )

    # 4. Validate dataset is not empty
    if df.empty:
        raise HTTPException(
            status_code=400,
            detail="The dataset is empty (no rows found). Please upload a CSV file with data.",
        )

    # 5. Build response payload
    columns = df.columns.tolist()
    dtypes = {col: str(dtype) for col, dtype in df.dtypes.items()}
    preview = df.head(10).fillna("").to_dict(orient="records")

    return {
        "filename": file.filename,
        "row_count": len(df),
        "column_count": len(columns),
        "columns": columns,
        "dtypes": dtypes,
        "preview": preview,
    }


# ─────────────────────────────────────────────
# Phase 2 Helpers
# ─────────────────────────────────────────────

ColType = Literal["numerical", "categorical", "datetime"]


def detect_column_types(df: pd.DataFrame) -> dict[str, ColType]:
    """Classify each column as numerical, datetime, or categorical."""
    result: dict[str, ColType] = {}
    for col in df.columns:
        if pd.api.types.is_numeric_dtype(df[col]):
            result[col] = "numerical"
        elif pd.api.types.is_datetime64_any_dtype(df[col]):
            result[col] = "datetime"
        else:
            # Try to parse as datetime
            try:
                converted = pd.to_datetime(df[col], infer_datetime_format=True, errors="raise")
                # Only treat as datetime if most values parsed cleanly
                if converted.notna().mean() > 0.8:
                    df[col] = converted
                    result[col] = "datetime"
                else:
                    result[col] = "categorical"
            except Exception:
                result[col] = "categorical"
    return result


def clean_dataframe(df: pd.DataFrame) -> pd.DataFrame:
    """Basic data cleaning: drop all-null columns, fill missing values."""
    # Drop columns that are entirely null
    df = df.dropna(axis=1, how="all")
    for col in df.columns:
        if pd.api.types.is_numeric_dtype(df[col]):
            df[col] = df[col].fillna(df[col].median())
        else:
            df[col] = df[col].fillna("Unknown")
    return df


def generate_suggestions(
    col_types: dict[str, ColType],
    df: pd.DataFrame,
    max_suggestions: int = 6,
) -> list[dict]:
    """Generate chart suggestions based on column type pairings."""
    suggestions: list[dict] = []

    numerical = [c for c, t in col_types.items() if t == "numerical"]
    categorical = [c for c, t in col_types.items() if t == "categorical"]
    datetime_cols = [c for c, t in col_types.items() if t == "datetime"]

    # Categorical + Numerical → Bar chart
    for cat, num in zip(categorical, numerical):
        suggestions.append({
            "x": cat,
            "y": num,
            "chart_type": "bar",
            "reason": f"'{cat}' (category) vs '{num}' (value) — great for comparing groups.",
        })
        if len(suggestions) >= max_suggestions:
            break

    # Datetime + Numerical → Line chart
    for dt in datetime_cols:
        for num in numerical:
            suggestions.append({
                "x": dt,
                "y": num,
                "chart_type": "line",
                "reason": f"'{dt}' (time) vs '{num}' — shows trends over time.",
            })
            if len(suggestions) >= max_suggestions:
                break

    # Numerical + Numerical → Scatter plot
    for col_a, col_b in combinations(numerical, 2):
        suggestions.append({
            "x": col_a,
            "y": col_b,
            "chart_type": "scatter",
            "reason": f"'{col_a}' vs '{col_b}' — both numeric, good for correlation.",
        })
        if len(suggestions) >= max_suggestions:
            break

    # Attach preview data for each suggestion (up to 50 rows)
    preview_df = df.head(50)
    for s in suggestions:
        s["data"] = (
            preview_df[[s["x"], s["y"]]]
            .fillna("")
            .rename(columns={s["x"]: "x", s["y"]: "y"})
            .to_dict(orient="records")
        )

    return suggestions[:max_suggestions]


# ─────────────────────────────────────────────
# Phase 2: Smart Visualization Endpoint
# ─────────────────────────────────────────────

@app.post("/suggest-visualizations")
async def suggest_visualizations(file: UploadFile = File(...)):
    """
    Upload a CSV file and receive:
    - columns: detected type per column (numerical / categorical / datetime)
    - suggestions: list of chart suggestions with pre-built data
    """
    if not file.filename.endswith(".csv"):
        raise HTTPException(status_code=400, detail="Only CSV files are accepted.")

    try:
        contents = await file.read()
        if not contents:
            raise HTTPException(status_code=400, detail="Uploaded file is empty.")
        df = pd.read_csv(io.BytesIO(contents))
    except pd.errors.EmptyDataError:
        raise HTTPException(status_code=400, detail="CSV file has no data.")
    except pd.errors.ParserError as e:
        raise HTTPException(status_code=400, detail=f"CSV parse error: {str(e)}")
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Unexpected error: {str(e)}")

    if df.empty:
        raise HTTPException(status_code=400, detail="Dataset has no rows.")

    df = clean_dataframe(df)
    col_types = detect_column_types(df)
    suggestions = generate_suggestions(col_types, df)

    return {
        "columns": col_types,
        "suggestions": suggestions,
    }


# ─────────────────────────────────────────────
# Phase 3 Imports
# ─────────────────────────────────────────────

import json
import re
from pydantic import BaseModel

try:
    import ollama as ollama_client
    OLLAMA_AVAILABLE = True
except ImportError:
    OLLAMA_AVAILABLE = False


# ─────────────────────────────────────────────
# Phase 3: Request Schema
# ─────────────────────────────────────────────

class AskAiRequest(BaseModel):
    question: str
    columns: dict[str, str]       # { "col": "numerical|categorical|datetime" }
    sample_rows: list[dict]       # up to 10 sample rows
    stats: dict[str, dict]        # { "col": { "min":, "max":, "mean": } }


VALID_CHART_TYPES = {"bar", "line", "scatter"}


def build_prompt(req: AskAiRequest) -> str:
    col_lines = "\n".join(
        f"  - {col} ({dtype})" for col, dtype in req.columns.items()
    )
    stats_lines = "\n".join(
        f"  - {col}: min={v.get('min','?')}, max={v.get('max','?')}, mean={v.get('mean','?')}"
        for col, v in req.stats.items()
    ) or "  (no numeric columns)"
    sample_str = json.dumps(req.sample_rows[:5], default=str)
    return f"""You are a data analyst. A user has uploaded a dataset with this structure:

Columns:
{col_lines}

Numeric Stats:
{stats_lines}

Sample Rows:
{sample_str}

User Question: {req.question}

Your task:
1. Answer the question clearly in 2-3 sentences using the dataset context above.
2. Suggest the BEST chart to visualize the answer.

You MUST return ONLY a valid JSON object — no explanation, no markdown, no extra text.
The JSON must have exactly this structure:
{{
  "answer": "<your 2-3 sentence explanation>",
  "chart": {{
    "type": "<bar|line|scatter>",
    "x": "<column name from dataset>",
    "y": "<column name from dataset>"
  }}
}}

Rules:
- chart.type must be exactly one of: bar, line, scatter
- chart.x and chart.y must be exact column names from the dataset columns listed above
- Do NOT include anything outside the JSON object"""


def extract_json_from_llm(text: str) -> dict:
    """Robustly extract the first JSON object from LLM output."""
    text = text.strip()
    try:
        return json.loads(text)
    except json.JSONDecodeError:
        pass
    match = re.search(r'\{[\s\S]*\}', text)
    if match:
        try:
            return json.loads(match.group())
        except json.JSONDecodeError:
            pass
    raise ValueError(f"No valid JSON found in LLM response: {text[:300]}")


def validate_ai_response(data: dict, valid_columns: list[str]) -> dict:
    """Validate and sanitize LLM JSON; fall back safely on bad values."""
    answer = str(data.get("answer", "")).strip() or "No insight could be generated."
    chart_raw = data.get("chart") or {}
    chart_type = str(chart_raw.get("type", "bar")).lower().strip()
    if chart_type not in VALID_CHART_TYPES:
        chart_type = "bar"
    x_col = str(chart_raw.get("x", "")).strip()
    y_col = str(chart_raw.get("y", "")).strip()
    if x_col not in valid_columns:
        x_col = valid_columns[0] if valid_columns else ""
    if y_col not in valid_columns:
        y_col = valid_columns[-1] if len(valid_columns) > 1 else x_col
    return {"answer": answer, "chart": {"type": chart_type, "x": x_col, "y": y_col}}


# ─────────────────────────────────────────────
# Phase 3: /ask-ai Endpoint
# ─────────────────────────────────────────────

@app.post("/ask-ai")
async def ask_ai(req: AskAiRequest):
    """
    Accepts a natural-language question + dataset summary.
    Returns AI insight text + chart suggestion via Ollama (llama3).
    """
    if not req.question.strip():
        raise HTTPException(status_code=400, detail="Question cannot be empty.")
    if not req.columns:
        raise HTTPException(status_code=400, detail="No column information provided.")
    if not OLLAMA_AVAILABLE:
        raise HTTPException(
            status_code=503,
            detail="Ollama package not installed. Run: pip install ollama",
        )

    prompt = build_prompt(req)
    valid_columns = list(req.columns.keys())

    try:
        response = ollama_client.chat(
            model="llama3",
            messages=[{"role": "user", "content": prompt}],
            options={"temperature": 0.2},
        )
        raw_text = response["message"]["content"]
    except Exception as e:
        err_str = str(e).lower()
        if any(k in err_str for k in ("connection", "refused", "connect", "socket")):
            raise HTTPException(
                status_code=503,
                detail=(
                    "Cannot connect to Ollama. Open a terminal and run: "
                    "ollama run llama3"
                ),
            )
        raise HTTPException(status_code=500, detail=f"Ollama error: {str(e)}")

    try:
        parsed = extract_json_from_llm(raw_text)
        result = validate_ai_response(parsed, valid_columns)
    except ValueError:
        result = {"answer": raw_text.strip()[:600], "chart": None}

    return result


# ─────────────────────────────────────────────
# Phase 4 Imports
# ─────────────────────────────────────────────

from fastapi import Response
import uuid
import io

try:
    from reportlab.lib.pagesizes import letter
    from reportlab.pdfgen import canvas
    REPORTLAB_AVAILABLE = True
except ImportError:
    REPORTLAB_AVAILABLE = False


# ─────────────────────────────────────────────
# Phase 4: Session Storage
# ─────────────────────────────────────────────

SESSION_STORE = {}

class SaveSessionRequest(BaseModel):
    dataset: dict
    chat_history: list

@app.post("/save-session")
async def save_session(req: SaveSessionRequest):
    session_id = str(uuid.uuid4())
    SESSION_STORE[session_id] = {
        "dataset": req.dataset,
        "chat_history": req.chat_history
    }
    return {"status": "ok", "session_id": session_id}

@app.get("/load-session/{session_id}")
async def load_session(session_id: str):
    if session_id not in SESSION_STORE:
        raise HTTPException(status_code=404, detail="Session not found")
    return SESSION_STORE[session_id]


# ─────────────────────────────────────────────
# Phase 4: Export Report (PDF)
# ─────────────────────────────────────────────

class ExportReportRequest(BaseModel):
    insight_text: str
    chart_info: dict | None
    dataset_filename: str

@app.post("/export-report")
async def export_report(req: ExportReportRequest):
    if not REPORTLAB_AVAILABLE:
        raise HTTPException(
            status_code=503,
            detail="reportlab is not installed. Run: pip install reportlab"
        )
    
    buffer = io.BytesIO()
    c = canvas.Canvas(buffer, pagesize=letter)
    width, height = letter

    # Title
    c.setFont("Helvetica-Bold", 24)
    c.drawString(50, height - 80, "AI Data Analysis Report")

    # Dataset Info
    c.setFont("Helvetica-Bold", 14)
    c.drawString(50, height - 130, "Dataset:")
    c.setFont("Helvetica", 12)
    c.drawString(150, height - 130, req.dataset_filename)

    # Insight
    c.setFont("Helvetica-Bold", 14)
    c.drawString(50, height - 180, "AI Insight:")
    
    c.setFont("Helvetica", 12)
    text_object = c.beginText(50, height - 210)
    text_object.setFont("Helvetica", 12)
    
    from textwrap import wrap
    lines = wrap(req.insight_text, width=80)
    for line in lines:
        text_object.textLine(line)
        
    c.drawText(text_object)

    # Chart Note
    current_y = height - 210 - (len(lines) * 15) - 30
    if req.chart_info:
        c.setFont("Helvetica-Bold", 14)
        c.drawString(50, current_y, "Suggested Chart:")
        c.setFont("Helvetica", 12)
        chart_str = f"Type: {req.chart_info.get('type')}, X-axis: {req.chart_info.get('x')}, Y-axis: {req.chart_info.get('y')}"
        c.drawString(50, current_y - 25, chart_str)

    c.save()
    buffer.seek(0)
    
    return Response(
        content=buffer.getvalue(),
        media_type="application/pdf",
        headers={"Content-Disposition": "attachment; filename=report.pdf"}
    )



