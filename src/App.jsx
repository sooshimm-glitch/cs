import { useState, useRef, useEffect, useCallback } from 'react';
import { createClient } from '@supabase/supabase-js';

// ─── Supabase 설정 ────────────────────────────────────────────
const SUPABASE_URL = 'https://zdwqmqaqegihrinpknzt.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inpkd3FtcWFxZWdpaHJpbnBrbnp0Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODAyNzA0MTMsImV4cCI6MjA5NTg0NjQxM30.HhOelyQqWBJFaTEyEYrdxmzZ5y9CW-s1jLeGVSCj0-g';

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// ─── 매체 감지 ──────────────────────────────────────────────────
const MEDIA_MAP = [
  { key: '네이버', cls: 'chip-naver',  label: '네이버',  domains: ['searchad.naver.com', 'adguide.naver.com'] },
  { key: '카카오', cls: 'chip-kakao',  label: '카카오',  domains: ['moment.kakao.com', 'kakaobusiness.kakao.com'] },
  { key: '당근',   cls: 'chip-daangn', label: '당근마켓', domains: ['business.daangn.com'] },
  { key: '구글',   cls: 'chip-google', label: '구글',    domains: ['support.google.com', 'ads.google.com'] },
  { key: '메타',   cls: 'chip-meta',   label: '메타',    domains: ['business.facebook.com'] },
  { key: '인스타', cls: 'chip-meta',   label: '메타',    domains: ['business.facebook.com'] },
  { key: '페이스북', cls:'chip-meta',  label: '메타',    domains: ['business.facebook.com'] },
  { key: '유튜브', cls: 'chip-google', label: '유튜브',  domains: ['support.google.com'] },
];

function detectMedia(text) {
  const found = [], seen = new Set();
  for (const m of MEDIA_MAP) {
    if (text.includes(m.key) && !seen.has(m.label)) {
      found.push(m);
      seen.add(m.label);
    }
  }
  return found;
}

// ─── Tavily 검색 ─────────────────────────────────────────────
async function tavilySearch(query, tavilyKey, domains) {
  const payload = {
    api_key: tavilyKey,
    query,
    search_depth: 'advanced',
    include_answer: true,
    include_raw_content: false,
    max_results: 5,
  };
  if (domains?.length) payload.include_domains = domains;

  const res = await fetch('https://api.tavily.com/search', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  const data = await res.json();

  const parts = [];
  const sources = [];
  if (data.answer) parts.push(`[검색 요약]\n${data.answer}`);
  for (const r of (data.results || [])) {
    if (r.url) sources.push({ title: r.title || r.url, url: r.url });
    parts.push(`[참고: ${r.title}]\n${r.content}`);
  }
  return { context: parts.join('\n---\n'), sources };
}

// ─── OpenAI 호출 ─────────────────────────────────────────────
async function callOpenAI(openaiKey, messages) {
  const res = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${openaiKey}`,
    },
    body: JSON.stringify({ model: 'gpt-4o', messages, max_tokens: 2000, temperature: 0.3 }),
  });
  if (!res.ok) {
    const err = await res.json();
    throw new Error(err.error?.message || `HTTP ${res.status}`);
  }
  const data = await res.json();
  return data.choices[0].message.content;
}

// ─── 시스템 프롬프트 ─────────────────────────────────────────
function buildPrompt(question, mode, guideline, searchContext) {
  const media = detectMedia(question);
  const mediaNote = media.length
    ? `질문에 ${media.map(m => m.label).join(', ')} 매체가 언급됩니다. 해당 매체의 최신 공식 정책 기반으로 답변하세요.`
    : '특정 매체 미언급. 일반 광고 운영 기준으로 답변하세요.';

  const guideNote = mode === '정밀' && guideline
    ? `\n\n# 사내 가이드라인 (최우선 적용)\n${guideline}`
    : '';

  const searchNote = searchContext
    ? `\n\n# 실시간 검색 결과 (공식 매체 페이지)\n아래 내용을 우선 참고하세요. URL은 절대 직접 작성하지 마세요.\n${searchContext}`
    : '';

  return `당신은 광고 대행사 전문 CS 담당자입니다. 대대행사 기술 질문에 팩트 중심으로 단 하나의 최적 답변을 제공합니다.

# 원칙
- 최신 매체 공식 정책을 정확히 반영합니다.
- 모든 수치는 근거와 함께 제공합니다.
- 불확실한 정보는 단정하지 않습니다.
- 출처 URL을 직접 작성하지 마세요. 시스템이 자동 처리합니다.
- 답변은 대대행사 담당자가 복사해서 그대로 보낼 수 있도록 깔끔하게 작성합니다.

# 매체: ${mediaNote}${guideNote}${searchNote}

# 출력 형식
- ## 소제목 + 내용 구조
- 수치/정책은 **굵게**
- 출처 섹션(📌 참고 출처 등) 절대 포함 금지
- 어체: 정중하고 전문적인 B2B 스타일`;
}

// ─── 상수 ─────────────────────────────────────────────────────
const STEPS = ['매체 키워드 탐색 중', '공식 매체 페이지 검색 중', '검색 결과 기반 답변 작성 중'];
const WELCOME_MSG = { id: 'welcome', role: 'ai', text: '안녕하세요! 대대행사 질문을 보내주세요. 매체 정책·광고 운영 기준 등 무엇이든 답변드립니다.', sources: [] };

// ─── Supabase DB 헬퍼 ─────────────────────────────────────────
async function dbSaveMessage(userId, conversationId, role, text, sources) {
  await supabase.from('messages').insert({
    user_id: userId,
    conversation_id: conversationId,
    role,
    text,
    sources: sources || [],
  });
}

async function dbLoadConversations(userId) {
  const { data } = await supabase
    .from('conversations')
    .select('id, title, created_at, updated_at')
    .eq('user_id', userId)
    .order('updated_at', { ascending: false })
    .limit(30);
  return data || [];
}

async function dbLoadMessages(conversationId) {
  const { data } = await supabase
    .from('messages')
    .select('id, role, text, sources, created_at')
    .eq('conversation_id', conversationId)
    .order('created_at', { ascending: true });
  return data || [];
}

async function dbCreateConversation(userId, title) {
  const { data } = await supabase
    .from('conversations')
    .insert({ user_id: userId, title })
    .select()
    .single();
  return data;
}

async function dbUpdateConversationTitle(id, title) {
  await supabase.from('conversations').update({ title, updated_at: new Date().toISOString() }).eq('id', id);
}

async function dbTouchConversation(id) {
  await supabase.from('conversations').update({ updated_at: new Date().toISOString() }).eq('id', id);
}

// ─── 메인 컴포넌트 ─────────────────────────────────────────────
export default function App() {
  // 인증
  const [authScreen, setAuthScreen] = useState('login'); // login | signup
  const [authEmail, setAuthEmail] = useState('');
  const [authPassword, setAuthPassword] = useState('');
  const [authLoading, setAuthLoading] = useState(false);
  const [authError, setAuthError] = useState('');
  const [user, setUser] = useState(null);
  const [sessionLoading, setSessionLoading] = useState(true);

  // 앱 상태
  const [screen, setScreen] = useState('setup'); // setup | chat
  const [keys, setKeys] = useState({ openai: '', tavily: '' });
  const [mode, setMode] = useState('기본');
  const [messages, setMessages] = useState([WELCOME_MSG]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [stepIdx, setStepIdx] = useState(0);
  const [copied, setCopied] = useState(null);
  const [guideline, setGuideline] = useState('');
  const [waitingFile, setWaitingFile] = useState(false);

  // 대화 기록
  const [conversations, setConversations] = useState([]);
  const [currentConvId, setCurrentConvId] = useState(null);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [convLoading, setConvLoading] = useState(false);

  const bottomRef = useRef(null);
  const inputRef = useRef(null);
  const stepTimer = useRef(null);
  const fileInputRef = useRef(null);

  // ── 세션 초기화 ──
  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setUser(session?.user ?? null);
      setSessionLoading(false);
    });
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null);
    });
    return () => subscription.unsubscribe();
  }, []);

  // 유저 로그인 후 키 로드
  useEffect(() => {
    if (!user) return;
    const saved = localStorage.getItem('adcs_keys');
    if (saved) {
      const k = JSON.parse(saved);
      setKeys(k);
      if (k.openai) {
        setScreen('chat');
        loadConversations();
      }
    }
  }, [user]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, loading]);

  // ── 대화 목록 로드 ──
  const loadConversations = async () => {
    if (!user) return;
    const convs = await dbLoadConversations(user.id);
    setConversations(convs);
  };

  // ── 대화 선택 ──
  const selectConversation = async (convId) => {
    setConvLoading(true);
    setSidebarOpen(false);
    setCurrentConvId(convId);
    const msgs = await dbLoadMessages(convId);
    if (msgs.length === 0) {
      setMessages([WELCOME_MSG]);
    } else {
      setMessages(msgs.map(m => ({
        id: m.id,
        role: m.role,
        text: m.text,
        sources: m.sources || [],
      })));
    }
    setConvLoading(false);
  };

  // ── 새 대화 ──
  const newConversation = () => {
    setCurrentConvId(null);
    setMessages([WELCOME_MSG]);
    setSidebarOpen(false);
    setTimeout(() => inputRef.current?.focus(), 100);
  };

  // ── 인증 ──
  const handleLogin = async () => {
    setAuthError('');
    setAuthLoading(true);
    const { error } = await supabase.auth.signInWithPassword({ email: authEmail, password: authPassword });
    setAuthLoading(false);
    if (error) setAuthError(error.message);
  };

  const handleSignup = async () => {
    setAuthError('');
    setAuthLoading(true);
    const { error } = await supabase.auth.signUp({ email: authEmail, password: authPassword });
    setAuthLoading(false);
    if (error) setAuthError(error.message);
    else setAuthError('✅ 이메일을 확인하고 링크를 클릭해 인증해주세요!');
  };

  const handleLogout = async () => {
    await supabase.auth.signOut();
    setScreen('setup');
    setMessages([WELCOME_MSG]);
    setCurrentConvId(null);
    setConversations([]);
    setKeys({ openai: '', tavily: '' });
  };

  // ── 설정 저장 후 채팅 시작 ──
  const startChat = () => {
    if (!keys.openai.startsWith('sk-')) return;
    localStorage.setItem('adcs_keys', JSON.stringify(keys));
    setScreen('chat');
    setMessages([WELCOME_MSG]);
    loadConversations();
    setTimeout(() => inputRef.current?.focus(), 100);
  };

  // ── 모드 전환 ──
  const switchMode = (m) => {
    setMode(m);
    if (m === '정밀') {
      setGuideline('');
      setWaitingFile(true);
      setMessages(prev => [...prev, {
        id: Date.now(), role: 'ai',
        text: '🔬 정밀 분석 모드로 전환됩니다.\n\n사내 가이드라인 파일을 업로드해주세요. (PDF, DOCX, XLSX, TXT 지원)\n\n파일을 업로드하면 해당 내용을 최우선으로 적용하여 답변드립니다.',
        sources: [], fileRequest: true,
      }]);
    } else {
      setWaitingFile(false);
      setGuideline('');
      setMessages(prev => [...prev, {
        id: Date.now(), role: 'ai',
        text: '🌐 기본 모드로 전환됩니다. 매체 공식 정책 기반으로 답변드립니다.',
        sources: [],
      }]);
    }
  };

  // ── 파일 업로드 ──
  const handleFileUpload = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const name = file.name.toLowerCase();
    let text = '';
    try {
      if (name.endsWith('.txt')) text = await file.text();
      else if (name.endsWith('.pdf')) text = '[PDF 파일 업로드됨 — 텍스트 추출은 서버 필요]';
      else if (name.endsWith('.docx')) text = '[DOCX 파일 업로드됨]';
      else if (name.endsWith('.xlsx')) text = '[XLSX 파일 업로드됨]';
      else text = await file.text();

      const preview = text.slice(0, 200);
      setGuideline(text.slice(0, 6000));
      setWaitingFile(false);
      setMessages(prev => [...prev,
        { id: Date.now(), role: 'user', text: `📎 ${file.name} 업로드됨`, sources: [] },
        { id: Date.now() + 1, role: 'ai', text: `✅ **${file.name}** 파일을 받았습니다!\n\n> ${preview}${text.length > 200 ? '…' : ''}\n\n이제 가이드라인을 적용하여 답변드립니다. 질문을 입력해주세요!`, sources: [] },
      ]);
    } catch (err) {
      setMessages(prev => [...prev, { id: Date.now(), role: 'ai', text: `⚠️ 파일 읽기 오류: ${err.message}`, sources: [] }]);
    }
  };

  // ── 스텝 애니메이션 ──
  const runSteps = useCallback(() => {
    setStepIdx(0);
    let i = 0;
    stepTimer.current = setInterval(() => {
      i++;
      if (i < STEPS.length) setStepIdx(i);
      else clearInterval(stepTimer.current);
    }, 1800);
  }, []);

  // ── 메시지 전송 + DB 저장 ──
  const send = async () => {
    const q = input.trim();
    if (!q || loading) return;
    setInput('');

    const userMsg = { id: Date.now(), role: 'user', text: q, sources: [] };
    setMessages(prev => [...prev, userMsg]);
    setLoading(true);
    runSteps();

    try {
      // 대화 생성 (처음이면)
      let convId = currentConvId;
      if (!convId && user) {
        const title = q.slice(0, 40) + (q.length > 40 ? '…' : '');
        const conv = await dbCreateConversation(user.id, title);
        convId = conv?.id;
        setCurrentConvId(convId);
        loadConversations();
      }

      // 유저 메시지 저장
      if (user && convId) {
        await dbSaveMessage(user.id, convId, 'user', q, []);
      }

      // Tavily 검색
      let searchContext = '';
      let sources = [];
      if (keys.tavily) {
        const media = detectMedia(q);
        const domains = [...new Set(media.flatMap(m => m.domains))];
        const result = await tavilySearch(`${q} 광고 정책 공식 가이드 2025`, keys.tavily, domains);
        searchContext = result.context;
        sources = result.sources;
      }

      // GPT 호출
      const systemPrompt = buildPrompt(q, mode, guideline, searchContext);
      const history = messages.filter(m => m.id !== 'welcome').slice(-6).map(m => ({
        role: m.role === 'user' ? 'user' : 'assistant',
        content: m.text,
      }));

      const answer = await callOpenAI(keys.openai, [
        { role: 'system', content: systemPrompt },
        ...history,
        { role: 'user', content: q },
      ]);

      const clean = answer.replace(/📌\s*참고\s*출처[\s\S]*$/g, '').replace(/\n+(출처|Source|URL)\s*:[\s\S]*$/gi, '').trim();

      const aiMsg = { id: Date.now(), role: 'ai', text: clean, sources };
      setMessages(prev => [...prev, aiMsg]);

      // AI 메시지 저장
      if (user && convId) {
        await dbSaveMessage(user.id, convId, 'ai', clean, sources);
        await dbTouchConversation(convId);
      }
    } catch (e) {
      setMessages(prev => [...prev, { id: Date.now(), role: 'ai', text: `⚠️ 오류가 발생했습니다: ${e.message}`, sources: [], error: true }]);
    } finally {
      clearInterval(stepTimer.current);
      setLoading(false);
    }
  };

  const handleKey = e => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); }
  };

  const copyMsg = (id, text) => {
    navigator.clipboard.writeText(text);
    setCopied(id);
    setTimeout(() => setCopied(null), 2000);
  };

  // ────────────────────────────────────────────────────────────
  // ── 로딩 중 ──
  if (sessionLoading) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '100vh', background: '#0a0a0a' }}>
        <div style={{ color: '#555', fontSize: 13 }}>불러오는 중…</div>
      </div>
    );
  }

  // ── 로그인/회원가입 화면 ──
  if (!user) {
    return (
      <div style={S.setupWrap}>
        <div style={S.setupCard}>
          <div style={S.setupLogo}>
            <span style={S.logoBox}>A</span>
            <div>
              <div style={S.setupTitle}>AdCS Pro</div>
              <div style={S.setupSub}>대대행 매체 CS 자동화</div>
            </div>
          </div>

          {/* 탭 */}
          <div style={{ display: 'flex', background: '#181818', borderRadius: 8, padding: 3, gap: 2, border: '1px solid #222' }}>
            {['login', 'signup'].map(tab => (
              <button
                key={tab}
                style={{ flex: 1, background: authScreen === tab ? '#242424' : 'transparent', border: 'none', color: authScreen === tab ? '#e0e0e0' : '#555', fontSize: 12, fontWeight: authScreen === tab ? 600 : 500, padding: '6px 0', borderRadius: 6, cursor: 'pointer', fontFamily: 'Noto Sans KR, sans-serif', transition: 'all 0.15s' }}
                onClick={() => { setAuthScreen(tab); setAuthError(''); }}
              >
                {tab === 'login' ? '로그인' : '회원가입'}
              </button>
            ))}
          </div>

          <div style={S.fieldWrap}>
            <label style={S.label}>이메일</label>
            <input
              style={S.input}
              type="email"
              placeholder="example@email.com"
              value={authEmail}
              onChange={e => setAuthEmail(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && (authScreen === 'login' ? handleLogin() : handleSignup())}
              autoFocus
            />
          </div>

          <div style={S.fieldWrap}>
            <label style={S.label}>비밀번호</label>
            <input
              style={S.input}
              type="password"
              placeholder="8자 이상"
              value={authPassword}
              onChange={e => setAuthPassword(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && (authScreen === 'login' ? handleLogin() : handleSignup())}
            />
          </div>

          {authError && (
            <div style={{ fontSize: 12, color: authError.startsWith('✅') ? '#22c55e' : '#f87171', marginTop: -8 }}>
              {authError}
            </div>
          )}

          <button
            style={{ ...S.startBtn, opacity: authEmail && authPassword.length >= 6 ? 1 : 0.4 }}
            onClick={authScreen === 'login' ? handleLogin : handleSignup}
            disabled={authLoading || !authEmail || authPassword.length < 6}
          >
            {authLoading ? '처리 중…' : authScreen === 'login' ? '로그인 →' : '회원가입 →'}
          </button>
        </div>
      </div>
    );
  }

  // ── API 키 설정 화면 ──
  if (screen === 'setup') {
    return (
      <div style={S.setupWrap}>
        <div style={S.setupCard}>
          <div style={S.setupLogo}>
            <span style={S.logoBox}>A</span>
            <div>
              <div style={S.setupTitle}>AdCS Pro</div>
              <div style={S.setupSub}>{user.email}</div>
            </div>
          </div>

          <div style={S.fieldWrap}>
            <label style={S.label}>OpenAI API Key <span style={S.req}>필수</span></label>
            <input
              style={S.input}
              type="password"
              placeholder="sk-..."
              value={keys.openai}
              onChange={e => setKeys(k => ({ ...k, openai: e.target.value }))}
              onKeyDown={e => e.key === 'Enter' && startChat()}
              autoFocus
            />
            {keys.openai && !keys.openai.startsWith('sk-') && (
              <div style={S.inputErr}>sk- 로 시작해야 합니다</div>
            )}
          </div>

          <div style={S.fieldWrap}>
            <label style={S.label}>Tavily API Key <span style={S.opt}>선택 · 실시간 검색</span></label>
            <input
              style={S.input}
              type="password"
              placeholder="tvly-... (없으면 생략 가능)"
              value={keys.tavily}
              onChange={e => setKeys(k => ({ ...k, tavily: e.target.value }))}
              onKeyDown={e => e.key === 'Enter' && startChat()}
            />
            <div style={S.inputHint}>
              없으면 GPT 학습 데이터 기반 답변 · <a href="https://tavily.com" target="_blank" rel="noreferrer" style={S.link}>tavily.com</a>에서 무료 발급
            </div>
          </div>

          <button
            style={{ ...S.startBtn, opacity: keys.openai.startsWith('sk-') ? 1 : 0.4 }}
            onClick={startChat}
            disabled={!keys.openai.startsWith('sk-')}
          >
            시작하기 →
          </button>

          <button
            style={{ background: 'transparent', border: '1px solid #2a2a2a', borderRadius: 10, padding: '10px 0', fontSize: 12, color: '#555', cursor: 'pointer', fontFamily: 'Noto Sans KR, sans-serif' }}
            onClick={handleLogout}
          >
            로그아웃
          </button>
        </div>
      </div>
    );
  }

  // ── 채팅 화면 ──
  return (
    <div style={S.chatWrap}>
      {/* 사이드바 오버레이 */}
      {sidebarOpen && (
        <div
          style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', zIndex: 40 }}
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* 사이드바 */}
      <div style={{
        position: 'fixed', top: 0, left: 0, bottom: 0, width: 280,
        background: '#0d0d0d', borderRight: '1px solid #1e1e1e',
        zIndex: 50, display: 'flex', flexDirection: 'column',
        transform: sidebarOpen ? 'translateX(0)' : 'translateX(-100%)',
        transition: 'transform 0.25s ease',
      }}>
        <div style={{ padding: '16px 16px 12px', borderBottom: '1px solid #1e1e1e', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: '#555', textTransform: 'uppercase', letterSpacing: '0.8px' }}>대화 기록</div>
          <button
            style={{ background: '#2563ff', border: 'none', borderRadius: 7, color: '#fff', fontSize: 11, fontWeight: 600, padding: '5px 10px', cursor: 'pointer', fontFamily: 'Noto Sans KR, sans-serif' }}
            onClick={newConversation}
          >
            + 새 대화
          </button>
        </div>

        <div style={{ flex: 1, overflowY: 'auto', padding: '8px 0' }}>
          {conversations.length === 0 && (
            <div style={{ padding: '16px', fontSize: 12, color: '#444', textAlign: 'center' }}>저장된 대화가 없습니다</div>
          )}
          {conversations.map(conv => (
            <button
              key={conv.id}
              style={{
                display: 'block', width: '100%', textAlign: 'left',
                background: conv.id === currentConvId ? '#1a1a1a' : 'transparent',
                border: 'none', borderLeft: conv.id === currentConvId ? '2px solid #2563ff' : '2px solid transparent',
                padding: '10px 16px', cursor: 'pointer',
                color: conv.id === currentConvId ? '#e0e0e0' : '#888',
                fontSize: 12, lineHeight: 1.5, fontFamily: 'Noto Sans KR, sans-serif',
                transition: 'all 0.15s',
              }}
              onClick={() => selectConversation(conv.id)}
            >
              <div style={{ fontWeight: 500, marginBottom: 2, overflow: 'hidden', whiteSpace: 'nowrap', textOverflow: 'ellipsis' }}>
                {conv.title}
              </div>
              <div style={{ fontSize: 10, color: '#444' }}>
                {new Date(conv.updated_at).toLocaleDateString('ko-KR', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
              </div>
            </button>
          ))}
        </div>

        <div style={{ padding: '12px 16px', borderTop: '1px solid #1e1e1e' }}>
          <div style={{ fontSize: 11, color: '#444', marginBottom: 8, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{user.email}</div>
          <button
            style={{ width: '100%', background: 'transparent', border: '1px solid #2a2a2a', borderRadius: 7, color: '#555', fontSize: 11, padding: '7px 0', cursor: 'pointer', fontFamily: 'Noto Sans KR, sans-serif' }}
            onClick={handleLogout}
          >
            로그아웃
          </button>
        </div>
      </div>

      {/* 헤더 */}
      <div style={S.header}>
        <div style={S.headerLeft}>
          <button
            style={{ ...S.iconBtn, marginRight: 4 }}
            onClick={() => setSidebarOpen(o => !o)}
            title="대화 기록"
          >
            ☰
          </button>
          <span style={S.logoBox}>A</span>
          <div>
            <div style={S.headerTitle}>AdCS Pro</div>
            <div style={S.headerSub}>
              <span style={{ color: '#22c55e', marginRight: 4 }}>●</span>온라인
            </div>
          </div>
        </div>
        <div style={S.headerRight}>
          <div style={S.modeWrap}>
            {['기본', '정밀'].map(m => (
              <button
                key={m}
                style={{ ...S.modeBtn, ...(mode === m ? S.modeBtnActive : {}) }}
                onClick={() => switchMode(m)}
              >
                {m === '기본' ? '🌐' : '🔬'} {m}
              </button>
            ))}
          </div>
          <button style={S.iconBtn} onClick={() => setScreen('setup')} title="설정">⚙</button>
        </div>
      </div>

      {/* 메시지 영역 */}
      <div style={S.msgArea}>
        {convLoading ? (
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', flex: 1 }}>
            <div style={{ color: '#555', fontSize: 12 }}>대화 불러오는 중…</div>
          </div>
        ) : (
          messages.map(msg => (
            <div key={msg.id} style={{ ...S.msgRow, justifyContent: msg.role === 'user' ? 'flex-end' : 'flex-start' }}>
              {msg.role === 'ai' && <div style={S.aiAvatar}>A</div>}
              <div style={{ maxWidth: '72%' }}>
                <div style={{ ...S.bubble, ...(msg.role === 'user' ? S.bubbleUser : S.bubbleAi), ...(msg.error ? S.bubbleErr : {}) }}>
                  <MsgContent text={msg.text} />
                  {msg.fileRequest && waitingFile && (
                    <div style={{ marginTop: 12 }}>
                      <input
                        ref={fileInputRef}
                        type="file"
                        accept=".pdf,.txt,.xlsx,.xls,.docx,.doc"
                        style={{ display: 'none' }}
                        onChange={handleFileUpload}
                      />
                      <button
                        style={{ background: '#2563ff', color: '#fff', border: 'none', borderRadius: 8, padding: '8px 16px', fontSize: 12, fontWeight: 600, cursor: 'pointer', fontFamily: 'Noto Sans KR, sans-serif' }}
                        onClick={() => fileInputRef.current?.click()}
                      >
                        📎 파일 업로드
                      </button>
                    </div>
                  )}
                </div>
                {msg.role === 'ai' && !msg.error && (
                  <div style={S.msgActions}>
                    <button style={S.copyBtn} onClick={() => copyMsg(msg.id, msg.text)}>
                      {copied === msg.id ? '✓ 복사됨' : '복사'}
                    </button>
                  </div>
                )}
                {msg.sources?.length > 0 && (
                  <div style={S.sourcesWrap}>
                    <div style={S.sourcesLabel}>🔗 참고 출처</div>
                    {msg.sources.map((s, i) => (
                      <div key={i} style={S.sourceItem}>
                        <span style={S.sourceNum}>{i + 1}</span>
                        <a href={s.url} target="_blank" rel="noreferrer" style={S.sourceLink}>{s.title}</a>
                      </div>
                    ))}
                  </div>
                )}
              </div>
              {msg.role === 'user' && <div style={S.userAvatar}>나</div>}
            </div>
          ))
        )}

        {loading && (
          <div style={{ ...S.msgRow, justifyContent: 'flex-start' }}>
            <div style={S.aiAvatar}>A</div>
            <div style={{ ...S.bubble, ...S.bubbleAi, minWidth: 200 }}>
              <Dots />
              <div style={S.stepText}>{STEPS[stepIdx]}</div>
            </div>
          </div>
        )}
        <div ref={bottomRef} />
      </div>

      {/* 입력 영역 */}
      <div style={S.inputArea}>
        {input && detectMedia(input).length > 0 && (
          <div style={S.chipRow}>
            <span style={S.chipLabel}>감지</span>
            {detectMedia(input).map((m, i) => (
              <span key={i} style={{ ...S.chip, ...chipStyle(m.cls) }}>{m.label}</span>
            ))}
          </div>
        )}
        <div style={S.inputRow}>
          <textarea
            ref={inputRef}
            style={S.textarea}
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={handleKey}
            placeholder="대대행사 질문을 입력하세요…  (Enter 전송 / Shift+Enter 줄바꿈)"
            rows={1}
            disabled={loading}
          />
          <button style={{ ...S.sendBtn, opacity: input.trim() && !loading ? 1 : 0.4 }} onClick={send} disabled={!input.trim() || loading}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/>
            </svg>
          </button>
        </div>
      </div>
    </div>
  );
}

// ── 마크다운 렌더 ─────────────────────────────────────────────
function MsgContent({ text }) {
  const lines = text.split('\n');
  return (
    <div style={{ lineHeight: 1.75, fontSize: 13.5 }}>
      {lines.map((line, i) => {
        if (line.startsWith('## ')) return <div key={i} style={{ fontWeight: 700, fontSize: 14, color: '#f0f0f0', marginTop: i > 0 ? 14 : 0, marginBottom: 4 }}>{line.slice(3)}</div>;
        if (line.startsWith('# '))  return <div key={i} style={{ fontWeight: 700, fontSize: 15, color: '#f0f0f0', marginTop: i > 0 ? 16 : 0, marginBottom: 6 }}>{line.slice(2)}</div>;
        if (line.startsWith('> '))  return <div key={i} style={{ borderLeft: '3px solid #333', paddingLeft: 10, color: '#888', fontStyle: 'italic', margin: '6px 0', fontSize: 12 }}>{line.slice(2)}</div>;
        if (line.startsWith('- ') || line.startsWith('• ')) return <div key={i} style={{ paddingLeft: 14, position: 'relative', marginBottom: 2 }}><span style={{ position: 'absolute', left: 0, color: '#555' }}>•</span>{renderInline(line.slice(2))}</div>;
        if (/^\d+\.\s/.test(line)) return <div key={i} style={{ paddingLeft: 18, position: 'relative', marginBottom: 2 }}><span style={{ position: 'absolute', left: 0, color: '#555' }}>{line.match(/^\d+/)[0]}.</span>{renderInline(line.replace(/^\d+\.\s/, ''))}</div>;
        if (line === '') return <div key={i} style={{ height: 6 }} />;
        return <div key={i} style={{ marginBottom: 2 }}>{renderInline(line)}</div>;
      })}
    </div>
  );
}

function renderInline(text) {
  const parts = text.split(/(\*\*[^*]+\*\*)/g);
  return parts.map((p, i) =>
    p.startsWith('**') && p.endsWith('**')
      ? <strong key={i} style={{ color: '#e8e8e8', fontWeight: 600 }}>{p.slice(2, -2)}</strong>
      : p
  );
}

function Dots() {
  return (
    <div style={{ display: 'flex', gap: 4, alignItems: 'center', marginBottom: 8 }}>
      {[0, 1, 2].map(i => (
        <span key={i} style={{
          width: 7, height: 7, borderRadius: '50%', background: '#555',
          animation: 'bounce 1.2s infinite', animationDelay: `${i * 0.2}s`, display: 'inline-block',
        }} />
      ))}
      <style>{`@keyframes bounce { 0%,80%,100%{transform:translateY(0);background:#444} 40%{transform:translateY(-6px);background:#888} }`}</style>
    </div>
  );
}

function chipStyle(cls) {
  const map = {
    'chip-naver':  { background: 'rgba(3,199,90,0.12)',  color: '#03c75a', border: '1px solid rgba(3,199,90,0.25)' },
    'chip-kakao':  { background: 'rgba(250,225,0,0.1)',  color: '#c8aa00', border: '1px solid rgba(250,225,0,0.25)' },
    'chip-daangn': { background: 'rgba(255,111,15,0.1)', color: '#ff6f0f', border: '1px solid rgba(255,111,15,0.25)' },
    'chip-google': { background: 'rgba(66,133,244,0.1)', color: '#4285f4', border: '1px solid rgba(66,133,244,0.25)' },
    'chip-meta':   { background: 'rgba(24,119,242,0.1)', color: '#1877f2', border: '1px solid rgba(24,119,242,0.25)' },
  };
  return map[cls] || {};
}

const S = {
  setupWrap: { display:'flex', alignItems:'center', justifyContent:'center', minHeight:'100vh', background:'#0a0a0a', padding:20 },
  setupCard: { background:'#111', border:'1px solid #222', borderRadius:16, padding:'32px 28px', width:'100%', maxWidth:400, display:'flex', flexDirection:'column', gap:20 },
  setupLogo: { display:'flex', alignItems:'center', gap:12, marginBottom:4 },
  setupTitle:{ fontSize:18, fontWeight:700, color:'#f0f0f0' },
  setupSub:  { fontSize:12, color:'#555' },
  fieldWrap: { display:'flex', flexDirection:'column', gap:6 },
  label:     { fontSize:11, fontWeight:600, color:'#666', textTransform:'uppercase', letterSpacing:'0.8px', display:'flex', alignItems:'center', gap:6 },
  req:       { fontSize:10, background:'rgba(37,99,255,0.15)', color:'#4f8ef7', padding:'1px 6px', borderRadius:4, fontWeight:600 },
  opt:       { fontSize:10, color:'#444', fontWeight:400, textTransform:'none', letterSpacing:0 },
  input:     { background:'#181818', border:'1px solid #2a2a2a', borderRadius:10, padding:'10px 14px', color:'#e0e0e0', fontSize:13, fontFamily:'Noto Sans KR, sans-serif', outline:'none', transition:'border-color 0.2s' },
  inputErr:  { fontSize:11, color:'#f87171', marginTop:2 },
  inputHint: { fontSize:11, color:'#444', marginTop:2 },
  link:      { color:'#4f8ef7', textDecoration:'none' },
  startBtn:  { background:'#2563ff', color:'#fff', border:'none', borderRadius:10, padding:'12px 0', fontSize:14, fontWeight:600, cursor:'pointer', fontFamily:'Noto Sans KR, sans-serif', transition:'all 0.15s' },
  chatWrap:  { display:'flex', flexDirection:'column', height:'100vh', background:'#0a0a0a' },
  header:    { display:'flex', alignItems:'center', justifyContent:'space-between', padding:'12px 16px', background:'#0f0f0f', borderBottom:'1px solid #1e1e1e', flexShrink:0 },
  headerLeft:{ display:'flex', alignItems:'center', gap:10 },
  headerTitle:{ fontSize:14, fontWeight:700, color:'#f0f0f0' },
  headerSub: { fontSize:10, color:'#555', marginTop:1 },
  headerRight:{ display:'flex', alignItems:'center', gap:8 },
  logoBox:   { width:32, height:32, background:'#2563ff', borderRadius:8, display:'flex', alignItems:'center', justifyContent:'center', fontSize:14, fontWeight:700, color:'#fff', flexShrink:0 },
  modeWrap:  { display:'flex', background:'#181818', borderRadius:8, padding:3, gap:2, border:'1px solid #222' },
  modeBtn:   { background:'transparent', border:'none', color:'#666', fontSize:12, fontWeight:500, padding:'5px 10px', borderRadius:6, cursor:'pointer', fontFamily:'Noto Sans KR, sans-serif', transition:'all 0.15s' },
  modeBtnActive:{ background:'#242424', color:'#e0e0e0', fontWeight:600 },
  iconBtn:   { background:'#181818', border:'1px solid #222', borderRadius:8, width:32, height:32, cursor:'pointer', color:'#666', fontSize:16, display:'flex', alignItems:'center', justifyContent:'center' },
  msgArea:   { flex:1, overflowY:'auto', padding:'20px 16px', display:'flex', flexDirection:'column', gap:16 },
  msgRow:    { display:'flex', alignItems:'flex-end', gap:8 },
  aiAvatar:  { width:28, height:28, background:'#2563ff', borderRadius:7, display:'flex', alignItems:'center', justifyContent:'center', fontSize:12, fontWeight:700, color:'#fff', flexShrink:0, marginBottom:2 },
  userAvatar:{ width:28, height:28, background:'#222', borderRadius:7, display:'flex', alignItems:'center', justifyContent:'center', fontSize:11, fontWeight:600, color:'#666', flexShrink:0, marginBottom:2, border:'1px solid #2a2a2a' },
  bubble:    { padding:'10px 14px', borderRadius:14, fontSize:13.5, lineHeight:1.7, wordBreak:'keep-all' },
  bubbleUser:{ background:'#2563ff', color:'#fff', borderRadius:'14px 14px 4px 14px' },
  bubbleAi:  { background:'#161616', border:'1px solid #222', color:'#d0d0d0', borderRadius:'4px 14px 14px 14px' },
  bubbleErr: { background:'#1a0a0a', border:'1px solid #3a1a1a', color:'#f87171' },
  msgActions:{ display:'flex', justifyContent:'flex-start', marginTop:4, paddingLeft:2 },
  copyBtn:   { background:'transparent', border:'1px solid #2a2a2a', borderRadius:6, padding:'3px 10px', fontSize:11, color:'#555', cursor:'pointer', fontFamily:'Noto Sans KR, sans-serif', transition:'all 0.15s' },
  stepText:  { fontSize:11, color:'#555', fontStyle:'italic' },
  sourcesWrap:  { marginTop:6, background:'#0e0e0e', border:'1px solid #1e1e1e', borderRadius:8, padding:'8px 12px' },
  sourcesLabel: { fontSize:10, fontWeight:600, color:'#444', textTransform:'uppercase', letterSpacing:'0.8px', marginBottom:6 },
  sourceItem:   { display:'flex', gap:6, alignItems:'baseline', padding:'3px 0', borderBottom:'1px solid #161616' },
  sourceNum:    { fontSize:10, color:'#444', flexShrink:0, minWidth:14 },
  sourceLink:   { fontSize:11, color:'#4f8ef7', textDecoration:'none', wordBreak:'break-all', lineHeight:1.5 },
  inputArea: { padding:'10px 16px 16px', background:'#0f0f0f', borderTop:'1px solid #1a1a1a', flexShrink:0 },
  chipRow:   { display:'flex', gap:5, alignItems:'center', marginBottom:6, flexWrap:'wrap' },
  chipLabel: { fontSize:10, color:'#444' },
  chip:      { fontSize:11, fontWeight:600, padding:'2px 8px', borderRadius:20 },
  inputRow:  { display:'flex', gap:8, alignItems:'flex-end' },
  textarea:  { flex:1, background:'#161616', border:'1px solid #252525', borderRadius:12, color:'#e0e0e0', fontSize:13.5, fontFamily:'Noto Sans KR, sans-serif', padding:'10px 14px', resize:'none', outline:'none', lineHeight:1.6, maxHeight:140, overflowY:'auto' },
  sendBtn:   { width:40, height:40, background:'#2563ff', border:'none', borderRadius:10, cursor:'pointer', color:'#fff', display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0, transition:'all 0.15s' },
};
