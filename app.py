"""
AdCS Pro — 대대행 대응 자동화 솔루션
실행: streamlit run adcs_pro.py
필요 패키지: pip install streamlit openai PyPDF2 openpyxl python-docx
"""

import streamlit as st
from openai import OpenAI
import io
import re
import requests
from datetime import datetime

# ─── Page Config ───────────────────────────────────────────────
st.set_page_config(
    page_title="AdCS Pro | 대대행 대응 자동화",
    page_icon="🎯",
    layout="wide",
    initial_sidebar_state="expanded",
)

# ─── Custom CSS ────────────────────────────────────────────────
st.markdown("""
<style>
@import url('https://fonts.googleapis.com/css2?family=Noto+Sans+KR:wght@300;400;500;700&display=swap');

html, body, [class*="css"] {
    font-family: 'Noto Sans KR', sans-serif;
}

#MainMenu, footer { visibility: hidden; }
header { visibility: visible !important; }

/* ── 전체 배경 ── */
.stApp { background: #f5f5f7; }
.block-container {
    padding-top: 1.5rem !important;
    padding-left: 2rem !important;
    padding-right: 2rem !important;
    padding-bottom: 2rem !important;
    max-width: 100% !important;
}

/* 메인 영역이 사이드바에 가리지 않도록 */
section[data-testid="stMain"] {
    overflow-x: hidden;
}
section[data-testid="stMain"] .block-container {
    padding-top: 1.5rem !important;
}

/* Force sidebar toggle */
[data-testid="collapsedControl"] {
    display: flex !important;
    visibility: visible !important;
    opacity: 1 !important;
}

/* ── Sidebar ── */
[data-testid="stSidebar"] {
    background: #1a1a2e !important;
    min-width: 270px !important;
    max-width: 300px !important;
}
[data-testid="stSidebar"] > div:first-child {
    min-width: 270px !important;
    padding: 1.2rem 1rem !important;
}
[data-testid="stSidebar"] * {
    color: #e8e6df !important;
    word-break: keep-all !important;
    overflow-wrap: break-word !important;
}
[data-testid="stSidebar"] .stTextInput input {
    background: rgba(255,255,255,0.06) !important;
    border: 1px solid rgba(255,255,255,0.15) !important;
    color: #e8e6df !important;
    font-size: 12px !important;
    border-radius: 8px !important;
}
[data-testid="stSidebar"] .stFileUploader {
    background: rgba(255,255,255,0.04) !important;
    border: 1.5px dashed rgba(255,255,255,0.15) !important;
    border-radius: 8px !important;
}
[data-testid="stSidebar"] label {
    font-size: 11px !important;
    text-transform: uppercase;
    letter-spacing: 0.8px;
    font-weight: 600 !important;
    color: #8a8899 !important;
}
[data-testid="stSidebar"] .stMarkdown h3 {
    color: #ffffff !important;
    font-size: 16px !important;
}
.hist-item {
    background: rgba(255,255,255,0.05);
    border-radius: 6px;
    padding: 7px 10px;
    margin-bottom: 4px;
    font-size: 11px;
    color: #a8a6b8;
    border: 1px solid transparent;
    word-break: keep-all;
}
.hist-item:hover { background: rgba(79,142,247,0.1); border-color: rgba(79,142,247,0.2); }

/* ── 채팅 레이아웃 ── */
.chat-wrap {
    display: flex;
    flex-direction: column;
    max-width: 860px;
    margin: 0 auto;
    padding: 0;
}

/* 상단 헤더 */
.chat-header {
    padding: 18px 0 10px;
    border-bottom: 1px solid #e2e1dc;
    display: flex;
    align-items: center;
    gap: 10px;
    flex-shrink: 0;
}
.chat-header-title {
    font-size: 17px;
    font-weight: 700;
    color: #1a1917;
}
.chat-badge {
    font-size: 10px;
    font-weight: 700;
    padding: 2px 9px;
    border-radius: 20px;
    background: #dbeafe;
    color: #2563eb;
    letter-spacing: 0.5px;
    text-transform: uppercase;
}

/* 모드 탭 */
.mode-tab-wrap {
    display: flex;
    gap: 0;
    background: #ebebeb;
    border-radius: 10px;
    padding: 3px;
    margin: 12px 0 0;
    flex-shrink: 0;
}
.mode-tab {
    flex: 1;
    text-align: center;
    padding: 7px 12px;
    border-radius: 8px;
    font-size: 12px;
    font-weight: 600;
    cursor: pointer;
    color: #8a8680;
    border: none;
    background: transparent;
    transition: all 0.2s;
}
.mode-tab.active {
    background: #fff;
    color: #1a1917;
    box-shadow: 0 1px 4px rgba(0,0,0,0.1);
}

/* 채팅 메시지 영역 */
.chat-messages {
    flex: 1;
    overflow-y: auto;
    padding: 20px 0 10px;
    display: flex;
    flex-direction: column;
    gap: 20px;
}

/* 환영 화면 */
.welcome-wrap {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    flex: 1;
    gap: 8px;
    padding: 40px 0 20px;
}
.welcome-title {
    font-size: 22px;
    font-weight: 700;
    color: #1a1917;
    text-align: center;
}
.welcome-sub {
    font-size: 13px;
    color: #8a8680;
    text-align: center;
    margin-bottom: 16px;
}

/* 예시 질문 카드 */
.example-grid {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 8px;
    width: 100%;
    margin-top: 8px;
}
.example-card {
    background: #fff;
    border: 1px solid #e5e3dc;
    border-radius: 10px;
    padding: 12px 14px;
    font-size: 12px;
    color: #4a4845;
    cursor: pointer;
    transition: all 0.18s;
    line-height: 1.5;
}
.example-card:hover { border-color: #2563eb; background: #f0f7ff; }
.example-card-label {
    font-size: 10px;
    font-weight: 700;
    color: #8a8680;
    text-transform: uppercase;
    letter-spacing: 0.8px;
    margin-bottom: 3px;
}

/* 사용자 말풍선 */
.msg-user {
    display: flex;
    justify-content: flex-end;
}
.msg-user-bubble {
    background: #2563eb;
    color: #fff;
    border-radius: 18px 18px 4px 18px;
    padding: 12px 16px;
    max-width: 72%;
    font-size: 14px;
    line-height: 1.6;
    word-break: keep-all;
}

/* AI 답변 */
.msg-ai {
    display: flex;
    gap: 10px;
    align-items: flex-start;
}
.msg-ai-avatar {
    width: 32px;
    height: 32px;
    border-radius: 50%;
    background: linear-gradient(135deg, #2563eb, #7c3aed);
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 14px;
    flex-shrink: 0;
    margin-top: 2px;
}
.msg-ai-body {
    flex: 1;
    min-width: 0;
}
.msg-ai-meta {
    font-size: 10px;
    color: #8a8680;
    margin-bottom: 6px;
}
.msg-ai-bubble {
    background: #fff;
    border: 1px solid #e5e3dc;
    border-radius: 4px 18px 18px 18px;
    padding: 16px 20px;
    font-size: 14px;
    line-height: 1.8;
    color: #1a1917;
    box-shadow: 0 2px 8px rgba(0,0,0,0.05);
    word-break: keep-all;
}
.msg-ai-sources {
    margin-top: 10px;
    background: #f9f8f5;
    border: 1px solid #e5e3dc;
    border-radius: 8px;
    padding: 10px 14px;
    font-size: 11px;
}
.msg-ai-sources-title {
    font-size: 10px;
    font-weight: 700;
    color: #8a8680;
    text-transform: uppercase;
    letter-spacing: 1px;
    margin-bottom: 6px;
}

/* 매체 감지 칩 */
.chip-wrap { display: flex; gap: 6px; flex-wrap: wrap; margin: 4px 0 10px; }
.chip {
    font-size: 11px;
    font-weight: 700;
    padding: 3px 10px;
    border-radius: 20px;
    letter-spacing: 0.3px;
    display: inline-block;
}
.chip-naver  { background: rgba(3,199,90,0.12); color: #039950; }
.chip-kakao  { background: rgba(249,224,0,0.20); color: #9a7c00; }
.chip-daangn { background: rgba(255,111,15,0.12); color: #c25000; }
.chip-google { background: rgba(66,133,244,0.12); color: #1a56cc; }
.chip-meta   { background: rgba(24,119,242,0.12); color: #1877f2; }

/* ── 입력창 하단 고정 ── */
.input-area {
    flex-shrink: 0;
    padding: 12px 0 20px;
    border-top: 1px solid #e2e1dc;
    background: #f5f5f7;
}
.input-label {
    font-size: 11px;
    font-weight: 600;
    color: #8a8680;
    text-transform: uppercase;
    letter-spacing: 0.8px;
    margin-bottom: 8px;
}

/* 입력창 스타일 */
.stTextArea textarea {
    border-radius: 16px !important;
    border: 1.5px solid #e2e1dc !important;
    background: #fff !important;
    font-family: 'Noto Sans KR', sans-serif !important;
    font-size: 14px !important;
    padding: 14px 18px !important;
    resize: none !important;
    box-shadow: 0 2px 12px rgba(0,0,0,0.06) !important;
    transition: border-color 0.2s !important;
}
.stTextArea textarea:focus {
    border-color: #2563eb !important;
    box-shadow: 0 2px 16px rgba(37,99,235,0.12) !important;
}

/* 버튼 */
div[data-testid="stButton"] > button {
    border-radius: 10px !important;
    font-family: 'Noto Sans KR', sans-serif !important;
    font-weight: 600 !important;
    font-size: 13px !important;
    transition: all 0.18s !important;
    height: 42px !important;
}
div[data-testid="stButton"] > button[kind="primary"] {
    background: #2563eb !important;
    color: white !important;
    box-shadow: 0 2px 8px rgba(37,99,235,0.25) !important;
    border: none !important;
}
div[data-testid="stButton"] > button[kind="primary"]:hover {
    background: #1d4ed8 !important;
    box-shadow: 0 4px 14px rgba(37,99,235,0.35) !important;
}
div[data-testid="stButton"] > button[kind="secondary"] {
    border: 1.5px solid #e2e1dc !important;
    color: #4a4845 !important;
    background: #fff !important;
}
div[data-testid="stButton"] > button[kind="secondary"]:hover {
    border-color: #2563eb !important;
    color: #2563eb !important;
    background: #f0f7ff !important;
}

/* mode info */
.mode-info {
    border-radius: 10px;
    padding: 10px 14px;
    margin-bottom: 10px;
    font-size: 12px;
    line-height: 1.6;
    display: flex;
    gap: 8px;
    align-items: flex-start;
}
.mode-info-normal  { background: #f9f8f5; border: 1px solid #e5e3dc; color: #4a4845; }
.mode-info-precise { background: #eff6ff; border: 1px solid #bfdbfe; color: #1e40af; }
.mode-tag {
    display: inline-block;
    font-size: 10px;
    font-weight: 700;
    padding: 1px 7px;
    border-radius: 20px;
    margin-left: 6px;
    vertical-align: middle;
}
.tag-free { background: #d1fae5; color: #065f46; }
.tag-paid { background: #dbeafe; color: #1e40af; }

div[data-testid="stAlert"] { border-radius: 10px !important; }
</style>
""", unsafe_allow_html=True)


# ─── Session State ─────────────────────────────────────────────
defaults = {
    "chat_messages": [],      # [{role, content, sources, mode, time}]
    "answer_history": [],
    "query_history": [],
    "guideline_text": "",
    "analysis_mode": "기본 모드",
    "gen_count": 0,
    "current_question": "",
    "conversation": [],
}
for k, v in defaults.items():
    if k not in st.session_state:
        st.session_state[k] = v


# ─── Helpers ──────────────────────────────────────────────────
def extract_file_text(uploaded_file) -> str:
    name = uploaded_file.name.lower()
    content = ""
    try:
        if name.endswith(".txt"):
            content = uploaded_file.read().decode("utf-8", errors="ignore")
        elif name.endswith(".pdf"):
            try:
                import PyPDF2
                reader = PyPDF2.PdfReader(io.BytesIO(uploaded_file.read()))
                content = "\n".join(page.extract_text() or "" for page in reader.pages)
            except ImportError:
                content = "[PDF 파싱 불가 — pip install PyPDF2]"
        elif name.endswith((".xlsx", ".xls")):
            try:
                import openpyxl
                wb = openpyxl.load_workbook(io.BytesIO(uploaded_file.read()), data_only=True)
                rows = []
                for ws in wb.worksheets:
                    for row in ws.iter_rows(values_only=True):
                        rows.append("\t".join(str(c) if c is not None else "" for c in row))
                content = "\n".join(rows)
            except ImportError:
                content = "[XLSX 파싱 불가 — pip install openpyxl]"
        elif name.endswith((".docx", ".doc")):
            try:
                from docx import Document
                doc = Document(io.BytesIO(uploaded_file.read()))
                content = "\n".join(p.text for p in doc.paragraphs)
            except ImportError:
                content = "[DOCX 파싱 불가 — pip install python-docx]"
    except Exception as e:
        content = f"[파일 읽기 오류: {e}]"
    return content[:6000]


MEDIA_MAP = {
    "네이버": ("chip-naver", "🟢 네이버"),
    "당근": ("chip-daangn", "🟠 당근"),
    "카카오": ("chip-kakao", "🟡 카카오"),
    "구글": ("chip-google", "🔵 구글"),
    "메타": ("chip-meta", "🔵 메타"),
    "인스타": ("chip-meta", "🔵 메타"),
    "페이스북": ("chip-meta", "🔵 메타"),
    "틱톡": ("chip-meta", "⚫ 틱톡"),
    "유튜브": ("chip-google", "🔴 유튜브"),
}

def detect_media(text: str):
    found, seen = [], set()
    for kw, (cls, label) in MEDIA_MAP.items():
        if kw in text and label not in seen:
            found.append((cls, label))
            seen.add(label)
    return found

def parse_sources(text: str):
    match = re.search(r"📌\s*참고 출처[:\s]*([\s\S]*?)$", text)
    if not match:
        return text, []
    main = text[: text.index(match.group(0))].strip()
    lines = [l.strip() for l in match.group(1).strip().split("\n") if l.strip()]
    return main, lines

def build_system_prompt(question: str, guideline: str, gen_count: int, mode: str) -> str:
    media_found = detect_media(question)
    regen_note = (
        f"\n\n⚠️ 이전 답변과 완전히 다른 논리와 구성으로 새 답변을 생성하세요 ({gen_count}회차)."
        if gen_count > 1 else ""
    )
    media_note = (
        f"질문에 {', '.join(label for _, label in media_found)} 매체가 언급되어 있습니다. "
        "해당 매체의 최신 공식 정책과 공지사항을 기반으로 답변하고, "
        "답변 말미에 참고한 출처 URL을 '📌 참고 출처:' 섹션에 반드시 명시하세요."
        if media_found else
        "특정 매체가 명시적으로 언급되지 않았습니다. 일반적인 광고 운영 기준으로 답변하되 관련 출처를 포함하세요."
    )

    if mode == "기본 모드":
        return f"""당신은 광고 대행사의 전문 CS 담당자입니다. 대대행사의 기술 질문에 대해 최신 매체 공식 정책과 팩트를 중심으로 단 하나의 최적 답변을 제공합니다.

# 원칙
- 광고 매체(네이버, 카카오, 당근마켓, 구글, 메타 등)의 최신 정책과 스펙을 정확히 반영합니다.
- 모든 수치와 정책 기준은 반드시 공식 출처와 함께 제공합니다.
- 복수의 답변을 나열하지 않고, 가장 완벽한 단 하나의 답변만 제공합니다.
- 불확실한 정보는 절대 단정하지 않고, 공식 출처 확인을 안내합니다.

# 매체 감지 결과
{media_note}
{regen_note}

# 출력 형식
- 명확한 구조로 작성 (## 소제목 + 내용)
- 수치나 정책은 **굵게** 표시
- 답변 첫 줄: "> 🌐 최신 매체 정책 기반의 팩트 중심 답변입니다."
- 답변 마지막에 "📌 참고 출처:" 섹션 반드시 포함 (공식 URL 형식)
- 어체: 정중하고 전문적인 B2B 커뮤니케이션 스타일"""

    guideline_note = (
        f"다음은 회사 가이드라인 내용입니다. 이 말투·기준·단가를 최우선으로 적용하세요:\n\n{guideline}"
        if guideline else
        "업로드된 가이드라인 없음. 일반 광고 업계 기준으로 답변하되 출처를 반드시 포함하세요."
    )
    return f"""당신은 광고 대행사의 전문 CS 담당자입니다. 업로드된 사내 가이드라인 + 최신 매체 공식 정책을 100% 반영한 팩트 중심의 단 하나의 최적 답변을 제공합니다.

# 원칙
- 사내 가이드라인의 말투·기준·단가를 일반 매체 정책보다 우선 적용합니다.
- 가이드라인에 없는 내용은 최신 매체 공식 정책으로 보완합니다.
- 모든 수치와 정책 기준은 반드시 출처와 함께 제공합니다.
- 복수의 답변을 나열하지 않고, 가장 완벽한 단 하나의 답변만 제공합니다.

# 사내 가이드라인
{guideline_note}

# 매체 감지 결과
{media_note}
{regen_note}

# 출력 형식
- 명확한 구조로 작성 (## 소제목 + 내용)
- 수치나 정책은 **굵게** 표시
- 답변 첫 줄: "> 🔬 사내 가이드라인 + 최신 매체 정책 기반의 정밀 답변입니다."
- 답변 마지막에 "📌 참고 출처:" 섹션 반드시 포함 (공식 URL 형식)
- 어체: 정중하고 전문적인 B2B 커뮤니케이션 스타일"""


# ─── 매체별 검색 도메인 화이트리스트 ──────────────────────────
MEDIA_DOMAINS = {
    "네이버": ["searchad.naver.com", "adguide.naver.com", "naver.com"],
    "카카오": ["moment.kakao.com", "kakaobusiness.kakao.com", "kakao.com"],
    "당근마켓": ["business.daangn.com", "daangn.com"],
    "구글":  ["support.google.com", "ads.google.com", "google.com"],
    "메타":  ["business.facebook.com", "facebook.com", "instagram.com"],
    "유튜브": ["support.google.com", "ads.google.com"],
    "틱톡":  ["ads.tiktok.com", "tiktok.com"],
}

def tavily_search(query: str, tavily_key: str, domains: list) -> str:
    """Tavily API로 실시간 검색 후 결과 텍스트 반환"""
    try:
        payload = {
            "api_key": tavily_key,
            "query": query,
            "search_depth": "advanced",
            "include_answer": True,
            "include_raw_content": False,
            "max_results": 5,
        }
        if domains:
            payload["include_domains"] = domains

        resp = requests.post(
            "https://api.tavily.com/search",
            json=payload,
            timeout=15,
        )
        data = resp.json()

        parts = []
        if data.get("answer"):
            parts.append(f"[검색 요약]\n{data['answer']}\n")

        for r in data.get("results", []):
            title   = r.get("title", "")
            url     = r.get("url", "")
            content = r.get("content", "")
            parts.append(f"[출처: {title}]\nURL: {url}\n{content}\n")

        return "\n---\n".join(parts) if parts else ""
    except Exception as e:
        return f"[검색 오류: {e}]"


def call_openai(api_key: str, tavily_key: str, question: str, guideline: str, gen_count: int, mode: str) -> str:
    client = OpenAI(api_key=api_key)

    # ── Tavily 검색 (기본 모드 항상, 정밀 모드도 보완 검색) ──
    search_context = ""
    if tavily_key:
        media_found = detect_media(question)
        domains = []
        for _, label in media_found:
            for key, dmns in MEDIA_DOMAINS.items():
                if key in label:
                    domains.extend(dmns)
        domains = list(set(domains))

        search_query = f"{question} 광고 정책 공식 가이드 2024 2025"
        search_context = tavily_search(search_query, tavily_key, domains)

    # ── 시스템 프롬프트 ──
    system_prompt = build_system_prompt(question, guideline, gen_count, mode)

    # 검색 결과 주입
    if search_context:
        system_prompt += f"""

# 실시간 검색 결과 (최신 매체 공식 정보)
아래는 방금 검색한 공식 매체 페이지의 실제 내용입니다.
반드시 이 내용을 우선 참고하여 답변하고, 출처 URL을 📌 참고 출처 섹션에 포함하세요.

{search_context}
"""

    messages = [{"role": "system", "content": system_prompt}]
    for msg in st.session_state.conversation:
        role = "user" if msg["role"] == "user" else "assistant"
        messages.append({"role": role, "content": msg["content"]})

    if gen_count > 1:
        user_msg = f"이전 답변({gen_count-1}회차)과는 다른 논리와 구성으로 새로운 최적 답변을 생성해주세요. 원래 질문: {question}"
    else:
        user_msg = question

    messages.append({"role": "user", "content": user_msg})

    response = client.chat.completions.create(
        model="gpt-4o",
        messages=messages,
        max_tokens=2000,
        temperature=0.3,
    )
    return response.choices[0].message.content


# ══════════════════════════════════════════════════════════════
#  SIDEBAR
# ══════════════════════════════════════════════════════════════
with st.sidebar:
    st.markdown("### 🎯 AdCS Pro")
    st.markdown(
        "<p style='font-size:11px;color:#6b6a80;text-transform:uppercase;"
        "letter-spacing:0.8px;margin-top:-8px;'>대대행 자동화</p>",
        unsafe_allow_html=True,
    )
    st.markdown("---")

    st.markdown("**🔑 OpenAI API Key**")
    api_key = st.text_input(
        "API Key", type="password", placeholder="sk-...", label_visibility="collapsed"
    )
    if api_key:
        if api_key.startswith("sk-") and len(api_key) > 20:
            st.markdown("<p style='font-size:11px;color:#34d399;margin-top:4px;'>● 연결됨</p>", unsafe_allow_html=True)
        else:
            st.markdown("<p style='font-size:11px;color:#f87171;margin-top:4px;'>● 키 형식 확인 필요 (sk- 로 시작)</p>", unsafe_allow_html=True)
    else:
        st.markdown("<p style='font-size:11px;color:#6b6a80;margin-top:4px;'>● 미연결</p>", unsafe_allow_html=True)

    st.markdown("---")

    st.markdown("**🔍 Tavily API Key** <span style='font-size:10px;color:#34d399;background:rgba(52,211,153,0.1);padding:1px 6px;border-radius:10px;'>실시간 검색</span>", unsafe_allow_html=True)
    tavily_key = st.text_input(
        "Tavily Key", type="password", placeholder="tvly-...", label_visibility="collapsed"
    )
    if tavily_key:
        if tavily_key.startswith("tvly-") and len(tavily_key) > 10:
            st.markdown("<p style='font-size:11px;color:#34d399;margin-top:4px;'>● 검색 연결됨</p>", unsafe_allow_html=True)
        else:
            st.markdown("<p style='font-size:11px;color:#f87171;margin-top:4px;'>● 키 형식 확인 필요</p>", unsafe_allow_html=True)
    else:
        st.markdown(
            "<p style='font-size:11px;color:#6b6a80;margin-top:4px;'>● 미연결 (없으면 검색 생략)</p>"
            "<p style='font-size:10px;color:#6b6a80;margin-top:2px;'>"
            "무료 키: <a href='https://tavily.com' target='_blank' style='color:#4f8ef7;'>tavily.com</a> (월 1,000회)</p>",
            unsafe_allow_html=True,
        )

    st.markdown("---")

    is_precise = st.session_state.get("analysis_mode") == "정밀 분석 모드"
    if is_precise:
        st.markdown(
            "<p style='font-size:11px;color:#4f8ef7;font-weight:700;"
            "text-transform:uppercase;letter-spacing:0.8px;margin-bottom:6px;'>"
            "📎 가이드라인 파일 <span style='font-size:10px;background:#4f8ef7;color:#fff;"
            "padding:1px 6px;border-radius:20px;'>정밀 분석 필수</span></p>",
            unsafe_allow_html=True,
        )
    else:
        st.markdown(
            "<p style='font-size:11px;color:#6b6a80;font-weight:600;"
            "text-transform:uppercase;letter-spacing:0.8px;margin-bottom:6px;'>"
            "📎 가이드라인 파일 <span style='font-size:10px;color:#4a4860;'>(정밀 모드 전용)</span></p>",
            unsafe_allow_html=True,
        )

    uploaded_files = st.file_uploader(
        "파일 업로드",
        accept_multiple_files=True,
        type=["pdf", "txt", "xlsx", "xls", "docx", "doc"],
        label_visibility="collapsed",
        disabled=not is_precise,
    )
    if uploaded_files:
        file_texts = []
        for f in uploaded_files:
            txt = extract_file_text(f)
            if txt:
                file_texts.append(f"=== {f.name} ===\n{txt}")
            st.markdown(f"<div class='hist-item'>📄 {f.name}</div>", unsafe_allow_html=True)
        st.session_state.guideline_text = "\n\n".join(file_texts)
    else:
        st.markdown("<p style='font-size:11px;color:#6b6a80;'>PDF · TXT · XLSX · DOCX 지원</p>", unsafe_allow_html=True)

    st.markdown("---")

    st.markdown("**📡 지원 매체**")
    st.markdown(
        """<div style='display:flex;gap:5px;flex-wrap:wrap;margin-top:4px;'>
        <span class='chip chip-naver'>네이버</span>
        <span class='chip chip-kakao'>카카오</span>
        <span class='chip chip-daangn'>당근</span>
        <span class='chip chip-google'>구글</span>
        <span class='chip chip-meta'>메타</span>
        </div>""",
        unsafe_allow_html=True,
    )

    st.markdown("---")

    # 검색 기록
    st.markdown("**🕐 검색 기록**")
    if st.session_state.answer_history:
        total = len(st.session_state.answer_history)
        st.markdown(f"<p style='font-size:10px;color:#6b6a80;margin-bottom:8px;'>총 {total}건</p>", unsafe_allow_html=True)
        for idx, item in enumerate(reversed(st.session_state.answer_history)):
            item_idx = total - idx
            short_q = item["question"][:35] + "…" if len(item["question"]) > 35 else item["question"]
            mode_icon = "🔬" if item.get("mode") == "정밀 분석 모드" else "🌐"
            with st.expander(f"{mode_icon} #{item_idx}  {short_q}", expanded=False):
                st.markdown(f"<p style='font-size:10px;color:#8a8680;'>🕒 {item.get('time','?')} · {item.get('mode','?')}</p>", unsafe_allow_html=True)
                st.markdown(f"<p style='font-size:12px;color:#a8a6b8;'>{item['question']}</p>", unsafe_allow_html=True)
                st.text_area("답변", value=item["answer"], height=160, key=f"hist_{item_idx}", label_visibility="collapsed")
        if st.button("🗑 기록 삭제", use_container_width=True, key="clear_hist"):
            st.session_state.answer_history = []
            st.session_state.query_history = []
            st.rerun()
    else:
        st.markdown("<p style='font-size:11px;color:#6b6a80;'>답변 생성 시 기록됩니다.</p>", unsafe_allow_html=True)

    st.markdown("---")
    st.markdown(
        "<p style='font-size:10px;color:#6b6a80;line-height:1.6;'>Powered by OpenAI GPT-4o</p>",
        unsafe_allow_html=True,
    )


# ══════════════════════════════════════════════════════════════
#  MAIN — 채팅 UI
# ══════════════════════════════════════════════════════════════

# 헤더
st.markdown(
    "<div class='chat-header'>"
    "<span style='font-size:20px;'>📋</span>"
    "<span class='chat-header-title'>CS 매체 대응 자동화</span>"
    "<span class='chat-badge'>BETA</span>"
    "</div>",
    unsafe_allow_html=True,
)

# 모드 선택 라디오
selected_mode = st.radio(
    "모드",
    options=["기본 모드", "정밀 분석 모드"],
    index=0 if st.session_state.analysis_mode == "기본 모드" else 1,
    horizontal=True,
    label_visibility="collapsed",
)
if selected_mode != st.session_state.analysis_mode:
    st.session_state.analysis_mode = selected_mode
    st.session_state.gen_count = 0
    st.session_state.conversation = []
    st.rerun()

# 모드 설명
if selected_mode == "기본 모드":
    st.markdown(
        "<div class='mode-info mode-info-normal'>"
        "<span style='font-size:16px;'>🌐</span>"
        "<div><span style='font-weight:700;font-size:12px;'>기본 모드</span>"
        "<span class='mode-tag tag-free'>GPT-4o</span><br>"
        "최신 매체 공식 정책 기반 팩트 중심 답변 · 출처 포함</div></div>",
        unsafe_allow_html=True,
    )
else:
    st.markdown(
        "<div class='mode-info mode-info-precise'>"
        "<span style='font-size:16px;'>🔬</span>"
        "<div><span style='font-weight:700;font-size:12px;'>정밀 분석 모드</span>"
        "<span class='mode-tag tag-paid'>가이드라인 우선</span><br>"
        "사내 가이드라인 최우선 적용 + 최신 매체 정책 보완 · <b>좌측에서 파일 업로드</b></div></div>",
        unsafe_allow_html=True,
    )

st.markdown("<div style='height:4px;'></div>", unsafe_allow_html=True)

# ── 채팅 메시지 출력 ───────────────────────────────────────────
EXAMPLES = [
    ("🟢 네이버", "네이버 GFA 영상광고 사이즈 정책이 최근 변경됐나요? 현재 지원 포맷과 해상도, 파일 용량 제한을 상세히 알려주세요."),
    ("🟠 당근", "당근마켓 지역 타겟팅 광고에서 반경 설정 최솟값이 어떻게 되나요? 최근 정책 변경 내용도 포함해 주세요."),
    ("🟡 카카오", "카카오모먼트 디스플레이 광고 소재 심사 기준 중 텍스트 비율 제한이 있나요? 예외 사항도 설명해 주세요."),
    ("🔵 구글", "구글 PMax 캠페인 전환 추적 설정 시 주의해야 할 최신 정책 변경 사항이 있나요?"),
]

if not st.session_state.chat_messages:
    # 환영 화면
    st.markdown(
        "<div style='text-align:center;padding:32px 0 8px;'>"
        "<div style='font-size:24px;font-weight:700;color:#1a1917;margin-bottom:6px;'>무엇을 도와드릴까요?</div>"
        "<div style='font-size:13px;color:#8a8680;'>매체 정책, 광고 운영 기준, 대대행사 질문에 답변합니다</div>"
        "</div>",
        unsafe_allow_html=True,
    )
    ecols = st.columns(2)
    for i, (label, text) in enumerate(EXAMPLES):
        with ecols[i % 2]:
            if st.button(f"{label}\n{text[:50]}…", key=f"ex_{i}", use_container_width=True):
                st.session_state["_prefill"] = text
                st.rerun()
    st.markdown("<div style='height:16px;'></div>", unsafe_allow_html=True)

else:
    # 대화 출력
    for msg in st.session_state.chat_messages:
        if msg["role"] == "user":
            st.markdown(
                f"<div class='msg-user'>"
                f"<div class='msg-user-bubble'>{msg['content']}</div>"
                f"</div>",
                unsafe_allow_html=True,
            )
        else:
            mode_icon = "🔬" if msg.get("mode") == "정밀 분석 모드" else "🌐"
            time_str = msg.get("time", "")
            st.markdown(
                f"<div class='msg-ai'>"
                f"<div class='msg-ai-avatar'>🎯</div>"
                f"<div class='msg-ai-body'>"
                f"<div class='msg-ai-meta'>AdCS Pro · {mode_icon} {msg.get('mode','기본 모드')} · {time_str}</div>",
                unsafe_allow_html=True,
            )
            with st.container():
                st.markdown(msg["content"])
            if msg.get("sources"):
                src_html = "<div class='msg-ai-sources'><div class='msg-ai-sources-title'>🔗 참고 출처</div>"
                for i, src in enumerate(msg["sources"], 1):
                    url_match = re.search(r"(https?://[^\s]+)", src)
                    if url_match:
                        url = url_match.group(1)
                        label = src.replace(url, "").strip().lstrip("-•*0123456789. ") or url
                        src_html += f"<div style='margin-bottom:3px;font-size:11px;'><b>{i}.</b> <a href='{url}' target='_blank' style='color:#2563eb;'>{label}</a></div>"
                    else:
                        src_html += f"<div style='margin-bottom:3px;font-size:11px;'><b>{i}.</b> {src}</div>"
                src_html += "</div>"
                st.markdown(src_html, unsafe_allow_html=True)
            st.markdown("</div></div>", unsafe_allow_html=True)
            st.markdown("<div style='height:4px;'></div>", unsafe_allow_html=True)

# ── 입력창 ─────────────────────────────────────────────────────
st.markdown("<div style='height:12px;'></div>", unsafe_allow_html=True)
st.markdown(
    "<p style='font-size:11px;font-weight:600;color:#8a8680;"
    "text-transform:uppercase;letter-spacing:0.8px;margin-bottom:6px;'>"
    "💬 대대행사 질문을 입력하세요</p>",
    unsafe_allow_html=True,
)

prefill = st.session_state.pop("_prefill", "")

question = st.text_area(
    "질문",
    value=prefill,
    height=100,
    placeholder="예) 네이버 쇼핑 검색광고 최소 입찰가 기준과 노출 조건이 어떻게 되나요?",
    label_visibility="collapsed",
    key="chat_input",
)

# 매체 감지 칩
if question:
    media = detect_media(question)
    if media:
        chips_html = "<div class='chip-wrap'><span style='font-size:11px;color:#8a8680;margin-right:4px;'>감지:</span>"
        for cls, label in media:
            chips_html += f"<span class='chip {cls}'>{label}</span>"
        chips_html += "</div>"
        st.markdown(chips_html, unsafe_allow_html=True)

col_send, col_regen, col_clear = st.columns([3, 2, 1])
with col_send:
    send_icon = "🌐" if selected_mode == "기본 모드" else "🔬"
    send_clicked = st.button(f"{send_icon} 답변 생성", type="primary", use_container_width=True)
with col_regen:
    regen_clicked = False
    if st.session_state.chat_messages:
        regen_clicked = st.button("🔄 다른 논리로 재생성", type="secondary", use_container_width=True)
with col_clear:
    if st.button("↺ 초기화", use_container_width=True):
        for k in ["chat_messages", "conversation", "gen_count", "current_question"]:
            st.session_state[k] = [] if k in ("chat_messages", "conversation") else (0 if k == "gen_count" else "")
        st.rerun()


# ── 생성 로직 ──────────────────────────────────────────────────
def run_generation(q: str, is_regen: bool):
    if not api_key:
        st.error("⚠️ 왼쪽 사이드바에서 OpenAI API Key를 먼저 입력해주세요.")
        return
    if not q.strip():
        st.error("⚠️ 질문을 입력해주세요.")
        return

    mode = st.session_state.analysis_mode

    if not is_regen:
        st.session_state.gen_count = 0
        st.session_state.current_question = q
        st.session_state.conversation = []

    st.session_state.gen_count += 1

    steps = (
        ["🌐 매체 키워드 파악 중...", "🔍 공식 매체 페이지 검색 중...", "✍️ 검색 결과 기반 답변 작성 중...", "✅ 완료!"]
        if mode == "기본 모드" else
        ["🔍 매체 감지 중...", "🔍 최신 공지 실시간 검색 중...", "📂 가이드라인 대조 분석 중...", "✅ 완료!"]
    )

    with st.status("답변을 생성하는 중...", expanded=True) as status:
        for step in steps[:-1]:
            st.write(step)
        guideline = st.session_state.guideline_text if mode == "정밀 분석 모드" else ""
        try:
            raw = call_openai(
                api_key=api_key,
                tavily_key=tavily_key,
                question=q,
                guideline=guideline,
                gen_count=st.session_state.gen_count,
                mode=mode,
            )
        except Exception as e:
            status.update(label="오류 발생", state="error")
            err_msg = str(e)
            if "invalid_api_key" in err_msg or "Incorrect API key" in err_msg:
                st.error("API Key가 올바르지 않습니다.")
            elif "429" in err_msg or "quota" in err_msg.lower():
                st.error("⚠️ API 쿼터 초과. 잠시 후 다시 시도해 주세요.")
            else:
                st.error(f"오류: {e}")
            return
        st.write(steps[-1])
        status.update(label="답변 생성 완료 ✓", state="complete")

    main_text, sources = parse_sources(raw)
    now_str = datetime.now().strftime("%H:%M")

    if not is_regen:
        st.session_state.chat_messages.append({"role": "user", "content": q})
    st.session_state.chat_messages.append({
        "role": "assistant",
        "content": main_text,
        "sources": sources,
        "mode": mode,
        "time": now_str,
    })

    st.session_state.conversation.append({"role": "user", "content": q if not is_regen else f"재생성 요청 {st.session_state.gen_count}회차"})
    st.session_state.conversation.append({"role": "assistant", "content": raw})

    if not is_regen and q not in st.session_state.query_history:
        st.session_state.query_history.append(q)
    st.session_state.answer_history.append({
        "question": q,
        "answer": main_text,
        "sources": sources,
        "mode": mode,
        "time": datetime.now().strftime("%m/%d %H:%M"),
    })
    st.rerun()


if send_clicked and question:
    run_generation(question, is_regen=False)

if regen_clicked and st.session_state.current_question:
    run_generation(st.session_state.current_question, is_regen=True)
