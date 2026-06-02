import { useState, useRef, useEffect, useCallback } from 'react';
import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = 'https://zdwqmqaqegihrinpknzt.supabase.co';
const SUPABASE_ANON = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inpkd3FtcWFxZWdpaHJpbnBrbnp0Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODAyNzA0MTMsImV4cCI6MjA5NTg0NjQxM30.HhOelyQqWBJFaTEyEYrdxmzZ5y9CW-s1jLeGVSCj0-g';
const supabase = createClient(SUPABASE_URL, SUPABASE_ANON);

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
    if (text.includes(m.key) && !seen.has(m.label)) { found.push(m); seen.add(m.label); }
  }
  return found;
}

async function tavilySearch(query, tavilyKey, domains) {
  const payload = { api_key: tavilyKey, query, search_depth: 'advanced', include_answer: true, include_raw_content: false, max_results: 5 };
  if (domains?.length) payload.include_domains = domains;
  const res = await fetch('https://api.tavily.com/search', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
  const data = await res.json();
  const parts = [], sources = [];
  if (data.answer) parts.push(`[검색 요약]\n${data.answer}`);
  for (const r of (data.results || [])) {
    if (r.url) sources.push({ title: r.title || r.url, url: r.url });
    parts.push(`[참고: ${r.title}]\n${r.content}`);
  }
  return { context: parts.join('\n---\n'), sources };
}

async function callAI(apiKey, tavilyKey, question, guideline, mode) {
  let searchCtx = '', sources = [];
  if (tavilyKey) {
    const media = detectMedia(question);
    const domains = [...new Set(media.flatMap(m => m.domains))];
    const { context, sources: s } = await tavilySearch(`${question} 광고 정책 공식 가이드 2025`, tavilyKey, domains);
    searchCtx = context; sources = s;
  }
  const modeIcon = mode === '정밀' ? '🔬' : '🌐';
  const modeDesc = mode === '정밀' ? '사내 가이드라인 + 최신 매체 정책 기반의 정밀 답변' : '최신 매체 정책 기반의 팩트 중심 답변';
  let system = `당신은 광고 대행사의 전문 CS 담당자입니다.\n\n# 원칙\n- 광고 매체의 최신 정책과 스펙을 정확히 반영합니다.\n- 모든 수치와 정책 기준은 반드시 공식 출처와 함께 제공합니다.\n- 불확실한 정보는 절대 단정하지 않습니다.\n\n답변 첫 줄: "> ${modeIcon} ${modeDesc}입니다."\n\n출처 섹션(📌 참고 출처)은 절대 포함하지 마세요. 출처는 시스템이 자동 처리합니다.`;
  if (mode === '정밀' && guideline) system += `\n\n# 사내 가이드라인 (최우선 적용)\n${guideline}`;
  if (searchCtx) system += `\n\n# 실시간 검색 결과\n${searchCtx}`;
  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-api-key': apiKey, 'anthropic-version': '2023-06-01' },
    body: JSON.stringify({ model: 'claude-opus-4-5', max_tokens: 2000, system, messages: [{ role: 'user', content: question }] }),
  });
  const data = await res.json();
  const text = data.content?.[0]?.text || '오류가 발생했습니다.';
  return { text: text.replace(/📌\s*참고 출처.*$/s, '').trim(), sources };
}

const STEPS = ['🌐 매체 키워드 파악 중...', '🔍 공식 매체 페이지 검색 중...', '✍️ 답변 작성 중...', '✅ 완료!'];

export default function App() {
  const [authScreen, setAuthScreen] = useState('login'); // login | signup
  const [user, setUser] = useState(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [authForm, setAuthForm] = useState({ email: '', password: '', name: '' });
  const [authErr, setAuthErr] = useState('');
  const [screen, setScreen] = useState('setup'); // setup | chat
  const [keys, setKeys] = useState({ openai: '', tavily: '' });
  const [mode, setMode] = useState('기본');
  const [messages, setMessages] = useState([]);
  const [convId, setConvId] = useState(null);
  const [historyList, setHistoryList] = useState([]);
  const [showHistory, setShowHistory] = useState(false);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [stepIdx, setStepIdx] = useState(0);
  const [copied, setCopied] = useState(null);
  const [guideline, setGuideline] = useState('');
  const [guidelineFiles, setGuidelineFiles] = useState([]); // [{id, filename, content}]
  const [waitingFile, setWaitingFile] = useState(false);
  const [showGuidelineList, setShowGuidelineList] = useState(false);
  const bottomRef = useRef(null);
  const inputRef = useRef(null);
  const stepTimer = useRef(null);
  const fileInputRef = useRef(null);

  // 인증 상태 확인
  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setUser(data.session?.user ?? null);
      setAuthLoading(false);
    });
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_e, session) => {
      setUser(session?.user ?? null);
    });
    return () => subscription.unsubscribe();
  }, []);

  // 로그인 후 키 불러오기
  useEffect(() => {
    if (!user) return;
    const saved = localStorage.getItem(`adcs_keys_${user.id}`);
    if (saved) {
      const k = JSON.parse(saved);
      setKeys(k);
      if (k.openai) {
        setScreen('chat');
        setMessages([{ id: 1, role: 'ai', text: `안녕하세요, **${user.user_metadata?.name || user.email}**님! 👋\n\n대대행사 질문을 입력해주세요.`, sources: [] }]);
        loadHistory(user.id);
        loadGuidelines(user.id);
      }
    }
  }, [user]);

  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [messages, loading]);

  const loadHistory = async (uid) => {
    const { data } = await supabase.from('conversations').select('id, messages, created_at').eq('user_id', uid).order('created_at', { ascending: false }).limit(20);
    if (data) setHistoryList(data);
  };

  const loadGuidelines = async (uid) => {
    const { data } = await supabase.from('guidelines').select('id, filename, content, created_at').eq('user_id', uid).order('created_at', { ascending: true });
    if (data && data.length > 0) {
      setGuidelineFiles(data);
      setGuideline(data.map(f => `=== ${f.filename} ===\n${f.content}`).join('\n\n'));
    }
  };

  const deleteGuideline = async (id) => {
    await supabase.from('guidelines').delete().eq('id', id);
    const updated = guidelineFiles.filter(f => f.id !== id);
    setGuidelineFiles(updated);
    setGuideline(updated.map(f => `=== ${f.filename} ===\n${f.content}`).join('\n\n'));
  };

  const saveConversation = useCallback(async (msgs, cid) => {
    if (!user) return cid;
    if (cid) {
      await supabase.from('conversations').update({ messages: msgs, updated_at: new Date().toISOString() }).eq('id', cid);
      return cid;
    } else {
      const { data } = await supabase.from('conversations').insert({ user_id: user.id, messages: msgs }).select('id').single();
      return data?.id;
    }
  }, [user]);

  const signup = async () => {
    setAuthErr('');
    if (!authForm.name.trim()) return setAuthErr('이름을 입력해주세요');
    if (!authForm.email.includes('@')) return setAuthErr('올바른 이메일을 입력해주세요');
    if (authForm.password.length < 6) return setAuthErr('비밀번호는 6자 이상이어야 합니다');
    setAuthLoading(true);
    const { error } = await supabase.auth.signUp({ email: authForm.email, password: authForm.password, options: { data: { name: authForm.name } } });
    setAuthLoading(false);
    if (error) setAuthErr(error.message);
    else setAuthErr('✅ 가입 완료! 이메일을 확인해주세요.');
  };

  const login = async () => {
    setAuthErr('');
    setAuthLoading(true);
    const { error } = await supabase.auth.signInWithPassword({ email: authForm.email, password: authForm.password });
    setAuthLoading(false);
    if (error) setAuthErr('이메일 또는 비밀번호가 올바르지 않습니다');
  };

  const logout = async () => {
    await supabase.auth.signOut();
    setScreen('setup'); setMessages([]); setConvId(null); setKeys({ openai: '', tavily: '' });
  };

  const startChat = () => {
    if (!keys.openai.startsWith('sk-')) return;
    localStorage.setItem(`adcs_keys_${user.id}`, JSON.stringify(keys));
    setScreen('chat');
    setConvId(null);
    setMessages([{ id: 1, role: 'ai', text: `안녕하세요, **${user.user_metadata?.name || user.email}**님! 👋\n\n대대행사 질문을 입력해주세요.`, sources: [] }]);
    loadHistory(user.id);
    loadGuidelines(user.id);
    setTimeout(() => inputRef.current?.focus(), 100);
  };

  const newChat = () => {
    setConvId(null);
    setMessages([{ id: 1, role: 'ai', text: '새 대화를 시작합니다. 질문을 입력해주세요!', sources: [] }]);
    setShowHistory(false);
  };

  const loadConv = (conv) => {
    setConvId(conv.id);
    setMessages(conv.messages || []);
    setShowHistory(false);
  };

  const switchMode = (m) => {
    setMode(m);
    if (m === '정밀') {
      setGuideline(''); setWaitingFile(true);
      setMessages(prev => [...prev, { id: Date.now(), role: 'ai', text: '🔬 정밀 분석 모드로 전환됩니다.\n\n사내 가이드라인 파일을 업로드해주세요. (PDF, DOCX, XLSX, TXT 지원)\n\n파일을 업로드하면 해당 내용을 최우선으로 적용하여 답변드립니다.', sources: [], fileRequest: true }]);
    } else {
      setWaitingFile(false); setGuideline('');
      setMessages(prev => [...prev, { id: Date.now(), role: 'ai', text: '🌐 기본 모드로 전환됩니다. 매체 공식 정책 기반으로 답변드립니다.', sources: [] }]);
    }
  };

  const handleFileUpload = async (e) => {
    const file = e.target.files[0]; if (!file) return;
    let text = '';
    try {
      text = await file.text();
      const newContent = text.slice(0, 6000);

      // Supabase에 저장
      const { data } = await supabase.from('guidelines').insert({ user_id: user.id, filename: file.name, content: newContent }).select('id, filename, content, created_at').single();

      // 누적 적용
      const updated = [...guidelineFiles, data];
      setGuidelineFiles(updated);
      setGuideline(updated.map(f => `=== ${f.filename} ===\n${f.content}`).join('\n\n'));
      setWaitingFile(false);

      setMessages(prev => [...prev,
        { id: Date.now(), role: 'user', text: `📎 ${file.name} 업로드됨`, sources: [] },
        { id: Date.now() + 1, role: 'ai', text: `✅ **${file.name}** 저장 완료!\n\n현재 적용 중인 가이드라인: **${updated.length}개**\n${updated.map((f, i) => `${i+1}. ${f.filename}`).join('\n')}\n\n질문을 입력해주세요!`, sources: [] }
      ]);
    } catch (err) {
      setMessages(prev => [...prev, { id: Date.now(), role: 'ai', text: `⚠️ 파일 읽기 오류: ${err.message}`, sources: [] }]);
    }
    e.target.value = '';
  };

  const runSteps = useCallback(() => {
    setStepIdx(0); let i = 0;
    stepTimer.current = setInterval(() => { i++; if (i < STEPS.length) setStepIdx(i); else clearInterval(stepTimer.current); }, 1800);
  }, []);

  const send = async () => {
    const q = input.trim(); if (!q || loading) return;
    setInput('');
    const userMsg = { id: Date.now(), role: 'user', text: q };
    const newMsgs = [...messages, userMsg];
    setMessages(newMsgs); setLoading(true); runSteps();
    try {
      const { text, sources } = await callAI(keys.openai, keys.tavily, q, guideline, mode);
      const aiMsg = { id: Date.now() + 1, role: 'ai', text, sources };
      const finalMsgs = [...newMsgs, aiMsg];
      setMessages(finalMsgs);
      const newCid = await saveConversation(finalMsgs, convId);
      if (newCid && !convId) { setConvId(newCid); loadHistory(user.id); }
    } catch (err) {
      setMessages(prev => [...prev, { id: Date.now() + 1, role: 'ai', text: `오류: ${err.message}`, sources: [], error: true }]);
    } finally { setLoading(false); clearInterval(stepTimer.current); }
  };

  const handleKey = (e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); } };
  const copyMsg = (id, text) => { navigator.clipboard.writeText(text); setCopied(id); setTimeout(() => setCopied(null), 2000); };

  // ── 로딩 중 ──
  if (authLoading) return <div style={{ display:'flex', alignItems:'center', justifyContent:'center', height:'100vh', background:'#0a0a0a', color:'#555', fontSize:14 }}>로딩 중...</div>;

  // ── 미로그인 ──
  if (!user) return (
    <div style={S.setupWrap}>
      <div style={S.setupCard}>
        <div style={S.setupLogo}>
          <span style={S.logoBox}>A</span>
          <div><div style={S.setupTitle}>AdCS Pro</div><div style={S.setupSub}>대대행 매체 CS 자동화</div></div>
        </div>
        <div style={{ display:'flex', background:'#181818', borderRadius:8, padding:3, gap:2, border:'1px solid #222' }}>
          {['login','signup'].map(t => (
            <button key={t} style={{ flex:1, background: authScreen===t ? '#242424':'transparent', border:'none', borderRadius:6, color: authScreen===t ? '#e0e0e0':'#555', fontSize:12, fontWeight:600, padding:'6px 0', cursor:'pointer', fontFamily:'Noto Sans KR, sans-serif' }} onClick={() => { setAuthScreen(t); setAuthErr(''); }}>
              {t === 'login' ? '로그인' : '회원가입'}
            </button>
          ))}
        </div>
        {authScreen === 'signup' && (
          <div style={S.fieldWrap}>
            <label style={S.label}>이름</label>
            <input style={S.input} placeholder="홍길동" value={authForm.name} onChange={e => setAuthForm(f => ({...f, name: e.target.value}))} />
          </div>
        )}
        <div style={S.fieldWrap}>
          <label style={S.label}>이메일</label>
          <input style={S.input} type="email" placeholder="example@email.com" value={authForm.email} onChange={e => setAuthForm(f => ({...f, email: e.target.value}))} onKeyDown={e => e.key==='Enter' && (authScreen==='login' ? login() : signup())} />
        </div>
        <div style={S.fieldWrap}>
          <label style={S.label}>비밀번호</label>
          <input style={S.input} type="password" placeholder="6자 이상" value={authForm.password} onChange={e => setAuthForm(f => ({...f, password: e.target.value}))} onKeyDown={e => e.key==='Enter' && (authScreen==='login' ? login() : signup())} />
        </div>
        {authErr && <div style={{ fontSize:12, color: authErr.startsWith('✅') ? '#22c55e' : '#f87171' }}>{authErr}</div>}
        <button style={S.startBtn} onClick={authScreen==='login' ? login : signup}>
          {authScreen === 'login' ? '로그인 →' : '회원가입 →'}
        </button>
      </div>
    </div>
  );

  // ── API 키 설정 ──
  if (screen === 'setup') return (
    <div style={S.setupWrap}>
      <div style={S.setupCard}>
        <div style={S.setupLogo}>
          <span style={S.logoBox}>A</span>
          <div><div style={S.setupTitle}>AdCS Pro</div><div style={S.setupSub}>안녕하세요, {user.user_metadata?.name || user.email}님!</div></div>
        </div>
        <div style={S.fieldWrap}>
          <label style={S.label}>OpenAI API Key <span style={S.req}>필수</span></label>
          <input style={S.input} type="password" placeholder="sk-..." value={keys.openai} onChange={e => setKeys(k => ({...k, openai: e.target.value}))} onKeyDown={e => e.key==='Enter' && startChat()} autoFocus />
          {keys.openai && !keys.openai.startsWith('sk-') && <div style={S.inputErr}>sk- 로 시작해야 합니다</div>}
        </div>
        <div style={S.fieldWrap}>
          <label style={S.label}>Tavily API Key <span style={S.opt}>선택 · 실시간 검색</span></label>
          <input style={S.input} type="password" placeholder="tvly-..." value={keys.tavily} onChange={e => setKeys(k => ({...k, tavily: e.target.value}))} onKeyDown={e => e.key==='Enter' && startChat()} />
          <div style={S.inputHint}>없으면 GPT 학습 데이터 기반 답변 · <a href="https://tavily.com" target="_blank" rel="noreferrer" style={S.link}>tavily.com</a>에서 무료 발급</div>
        </div>
        <button style={{ ...S.startBtn, opacity: keys.openai.startsWith('sk-') ? 1 : 0.4 }} onClick={startChat} disabled={!keys.openai.startsWith('sk-')}>시작하기 →</button>
        <button style={{ background:'transparent', border:'none', color:'#555', fontSize:12, cursor:'pointer', fontFamily:'Noto Sans KR, sans-serif' }} onClick={logout}>로그아웃</button>
      </div>
    </div>
  );

  // ── 채팅 화면 ──
  return (
    <div style={S.chatWrap}>
      {/* 왼쪽 사이드바 */}
      <div style={S.sidebar}>
        {/* 로고 */}
        <div style={S.sidebarHeader}>
          <span style={S.logoBox}>A</span>
          <div style={{ flex:1 }}>
            <div style={{ fontSize:13, fontWeight:700, color:'#f0f0f0' }}>AdCS Pro</div>
            <div style={{ fontSize:10, color:'#555' }}>{user.user_metadata?.name || user.email}</div>
          </div>
        </div>

        {/* 새 대화 버튼 */}
        <button style={S.newChatBtn} onClick={newChat}>✏️ 새 대화</button>

        {/* 모드 토글 */}
        <div style={{ padding:'0 10px', marginBottom:8 }}>
          <div style={{ fontSize:10, fontWeight:600, color:'#444', textTransform:'uppercase', letterSpacing:'0.8px', marginBottom:6 }}>모드</div>
          <div style={S.modeWrap}>
            {['기본','정밀'].map(m => (
              <button key={m} style={{ ...S.modeBtn, ...(mode===m ? S.modeBtnActive : {}) }} onClick={() => switchMode(m)}>
                {m === '기본' ? '🌐 기본' : '🔬 정밀'}
              </button>
            ))}
          </div>
        </div>

        {/* 가이드라인 파일 */}
        <div style={{ padding:'0 10px', marginBottom:8 }}>
          <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:6 }}>
            <div style={{ fontSize:10, fontWeight:600, color:'#444', textTransform:'uppercase', letterSpacing:'0.8px' }}>가이드라인 ({guidelineFiles.length})</div>
            <button style={{ background:'transparent', border:'1px solid #2e3a55', borderRadius:5, padding:'2px 7px', fontSize:10, color:'#7eb8ff', cursor:'pointer' }}
              onClick={() => { switchMode('정밀'); setWaitingFile(true); }}>+ 추가</button>
          </div>
          {guidelineFiles.length === 0
            ? <div style={{ fontSize:11, color:'#333' }}>없음</div>
            : guidelineFiles.map(f => (
              <div key={f.id} style={S.sideFileItem}>
                <span style={{ fontSize:11, color:'#888', flex:1, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>📄 {f.filename}</span>
                <button style={{ background:'transparent', border:'none', color:'#555', cursor:'pointer', fontSize:12, padding:'0 2px', flexShrink:0 }} onClick={() => deleteGuideline(f.id)}>✕</button>
              </div>
            ))
          }
        </div>

        <div style={{ borderTop:'1px solid #1e1e1e', margin:'4px 0 8px' }} />

        {/* 대화 기록 */}
        <div style={{ padding:'0 10px', flex:1, overflowY:'auto' }}>
          <div style={{ fontSize:10, fontWeight:600, color:'#444', textTransform:'uppercase', letterSpacing:'0.8px', marginBottom:8 }}>대화 기록</div>
          {historyList.length === 0 && <div style={{ fontSize:11, color:'#333' }}>없음</div>}
          {historyList.map(conv => {
            const first = conv.messages?.find(m => m.role === 'user');
            const preview = first?.text?.slice(0, 30) || '대화';
            const date = new Date(conv.created_at).toLocaleDateString('ko-KR', { month:'short', day:'numeric' });
            const isActive = convId === conv.id;
            return (
              <div key={conv.id} style={{ ...S.histItem, ...(isActive ? { background:'#1a1f2e', borderColor:'#2e3a55' } : {}) }} onClick={() => loadConv(conv)}>
                <div style={{ fontSize:12, color: isActive ? '#a8d4ff' : '#bbb', marginBottom:2, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{preview}</div>
                <div style={{ fontSize:10, color:'#444' }}>{date}</div>
              </div>
            );
          })}
        </div>

        {/* 하단 로그아웃 */}
        <div style={{ padding:'10px', borderTop:'1px solid #1e1e1e' }}>
          <button style={{ width:'100%', background:'transparent', border:'1px solid #222', borderRadius:8, padding:'7px 0', fontSize:12, color:'#555', cursor:'pointer', fontFamily:'Noto Sans KR, sans-serif' }} onClick={logout}>로그아웃</button>
        </div>
      </div>

      {/* 오른쪽 채팅 영역 */}
      <div style={S.chatMain}>
        {/* 헤더 */}
        <div style={S.header}>
          <div style={S.headerLeft}>
            <div style={{ fontSize:13, fontWeight:600, color:'#e0e0e0' }}>
              {mode === '정밀' ? '🔬 정밀 분석 모드' : '🌐 기본 모드'}
            </div>
          </div>
          <div style={S.headerRight}>
            <button style={S.iconBtn} title="새 대화" onClick={newChat}>✏️</button>
          </div>
        </div>

      <div style={S.msgArea}>
        {messages.map(msg => (
          <div key={msg.id} style={{ ...S.msgRow, justifyContent: msg.role==='user' ? 'flex-end' : 'flex-start' }}>
            {msg.role === 'ai' && <div style={S.aiAvatar}>A</div>}
            <div style={{ maxWidth:'75%' }}>
              <div style={{ ...S.bubble, ...(msg.role==='user' ? S.bubbleUser : S.bubbleAi), ...(msg.error ? S.bubbleErr : {}) }}>
                <MsgContent text={msg.text} />
                {msg.fileRequest && waitingFile && (
                  <div style={{ marginTop:12 }}>
                    <input ref={fileInputRef} type="file" accept=".pdf,.txt,.xlsx,.xls,.docx,.doc" style={{ display:'none' }} onChange={handleFileUpload} />
                    <button style={{ background:'#2563ff', color:'#fff', border:'none', borderRadius:8, padding:'8px 16px', fontSize:12, fontWeight:600, cursor:'pointer', fontFamily:'Noto Sans KR, sans-serif' }} onClick={() => fileInputRef.current?.click()}>📎 파일 업로드</button>
                  </div>
                )}
              </div>
              {msg.role==='ai' && !msg.error && (
                <div style={S.msgActions}>
                  <button style={S.copyBtn} onClick={() => copyMsg(msg.id, msg.text)}>{copied===msg.id ? '✓ 복사됨' : '복사'}</button>
                </div>
              )}
              {msg.sources?.length > 0 && (
                <div style={S.sourcesWrap}>
                  <div style={S.sourcesLabel}>🔗 참고 출처</div>
                  {msg.sources.map((s, i) => (
                    <div key={i} style={S.sourceItem}>
                      <span style={S.sourceNum}>{i+1}</span>
                      <a href={s.url} target="_blank" rel="noreferrer" style={S.sourceLink}>{s.title}</a>
                    </div>
                  ))}
                </div>
              )}
            </div>
            {msg.role==='user' && <div style={S.userAvatar}>나</div>}
          </div>
        ))}
        {loading && (
          <div style={{ ...S.msgRow, justifyContent:'flex-start' }}>
            <div style={S.aiAvatar}>A</div>
            <div style={{ ...S.bubble, ...S.bubbleAi, minWidth:200 }}>
              <Dots /><div style={S.stepText}>{STEPS[stepIdx]}</div>
            </div>
          </div>
        )}
        <div ref={bottomRef} />
      </div>

      <div style={S.inputArea}>
        {input && detectMedia(input).length > 0 && (
          <div style={S.chipRow}>
            <span style={S.chipLabel}>감지</span>
            {detectMedia(input).map((m, i) => <span key={i} style={{ ...S.chip, ...chipStyle(m.cls) }}>{m.label}</span>)}
          </div>
        )}
        <div style={S.inputRow}>
          <textarea ref={inputRef} style={S.textarea} value={input} onChange={e => setInput(e.target.value)} onKeyDown={handleKey} placeholder="대대행사 질문을 입력하세요…  (Enter 전송 / Shift+Enter 줄바꿈)" rows={1} disabled={loading} />
          <button style={{ ...S.sendBtn, opacity: input.trim() && !loading ? 1 : 0.4 }} onClick={send} disabled={!input.trim() || loading}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/></svg>
          </button>
        </div>
      </div>
      </div>{/* chatMain 닫기 */}
    </div>
  );
}

function MsgContent({ text }) {
  const lines = text.split('\n');
  return (
    <div style={{ lineHeight:1.75, fontSize:13.5 }}>
      {lines.map((line, i) => {
        if (line.startsWith('## ')) return <div key={i} style={{ fontWeight:700, fontSize:14, color:'#7eb8ff', marginTop: i>0?14:0, marginBottom:4 }}>{line.slice(3)}</div>;
        if (line.startsWith('# '))  return <div key={i} style={{ fontWeight:700, fontSize:15, color:'#a8d4ff', marginTop: i>0?16:0, marginBottom:6 }}>{line.slice(2)}</div>;
        if (line.startsWith('> '))  return <div key={i} style={{ borderLeft:'3px solid #2e3a55', paddingLeft:10, color:'#8899bb', fontStyle:'italic', margin:'6px 0', fontSize:12 }}>{line.slice(2)}</div>;
        if (line.startsWith('- ') || line.startsWith('• ')) return <div key={i} style={{ paddingLeft:14, position:'relative', marginBottom:2 }}><span style={{ position:'absolute', left:0, color:'#5a7aaa' }}>•</span>{renderInline(line.slice(2))}</div>;
        if (/^\d+\.\s/.test(line)) return <div key={i} style={{ paddingLeft:18, position:'relative', marginBottom:2 }}><span style={{ position:'absolute', left:0, color:'#5a7aaa' }}>{line.match(/^\d+/)[0]}.</span>{renderInline(line.replace(/^\d+\.\s/, ''))}</div>;
        if (line === '') return <div key={i} style={{ height:6 }} />;
        return <div key={i} style={{ marginBottom:2 }}>{renderInline(line)}</div>;
      })}
    </div>
  );
}

function renderInline(text) {
  const parts = text.split(/(\*\*[^*]+\*\*)/g);
  return parts.map((p, i) =>
    p.startsWith('**') && p.endsWith('**')
      ? <strong key={i} style={{ color:'#a8d4ff', fontWeight:600 }}>{p.slice(2,-2)}</strong>
      : p
  );
}

function Dots() {
  return (
    <div style={{ display:'flex', gap:4, alignItems:'center', marginBottom:8 }}>
      {[0,1,2].map(i => <span key={i} style={{ width:7, height:7, borderRadius:'50%', background:'#555', animation:'bounce 1.2s infinite', animationDelay:`${i*0.2}s`, display:'inline-block' }} />)}
      <style>{`@keyframes bounce{0%,80%,100%{transform:translateY(0);background:#444}40%{transform:translateY(-6px);background:#888}}`}</style>
    </div>
  );
}

function chipStyle(cls) {
  const map = {
    'chip-naver':  { background:'rgba(3,199,90,0.12)',  color:'#03c75a', border:'1px solid rgba(3,199,90,0.25)' },
    'chip-kakao':  { background:'rgba(250,225,0,0.1)',  color:'#c8aa00', border:'1px solid rgba(250,225,0,0.25)' },
    'chip-daangn': { background:'rgba(255,111,15,0.1)', color:'#ff6f0f', border:'1px solid rgba(255,111,15,0.25)' },
    'chip-google': { background:'rgba(66,133,244,0.1)', color:'#4285f4', border:'1px solid rgba(66,133,244,0.25)' },
    'chip-meta':   { background:'rgba(24,119,242,0.1)', color:'#1877f2', border:'1px solid rgba(24,119,242,0.25)' },
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
  input:     { background:'#181818', border:'1px solid #2a2a2a', borderRadius:10, padding:'10px 14px', color:'#e0e0e0', fontSize:13, fontFamily:'Noto Sans KR, sans-serif', outline:'none' },
  inputErr:  { fontSize:11, color:'#f87171', marginTop:2 },
  inputHint: { fontSize:11, color:'#444', marginTop:2 },
  link:      { color:'#4f8ef7', textDecoration:'none' },
  startBtn:  { background:'#2563ff', color:'#fff', border:'none', borderRadius:10, padding:'12px 0', fontSize:14, fontWeight:600, cursor:'pointer', fontFamily:'Noto Sans KR, sans-serif' },

  // 전체 레이아웃
  chatWrap:  { display:'flex', height:'100vh', background:'#0a0a0a', overflow:'hidden' },

  // 사이드바
  sidebar:      { width:220, minWidth:220, background:'#0d0d0d', borderRight:'1px solid #1a1a1a', display:'flex', flexDirection:'column', overflow:'hidden' },
  sidebarHeader:{ display:'flex', alignItems:'center', gap:10, padding:'14px 12px', borderBottom:'1px solid #1a1a1a' },
  newChatBtn:   { margin:'10px 10px 8px', background:'#161616', border:'1px solid #252525', borderRadius:8, padding:'8px 12px', fontSize:12, fontWeight:600, color:'#aaa', cursor:'pointer', fontFamily:'Noto Sans KR, sans-serif', textAlign:'left' },
  sideFileItem: { display:'flex', alignItems:'center', gap:4, padding:'4px 6px', borderRadius:6, marginBottom:2, background:'#141414', border:'1px solid #1e1e1e' },

  // 채팅 메인
  chatMain:  { flex:1, display:'flex', flexDirection:'column', overflow:'hidden' },
  header:    { display:'flex', alignItems:'center', justifyContent:'space-between', padding:'11px 16px', background:'#0f0f0f', borderBottom:'1px solid #1e1e1e', flexShrink:0 },
  headerLeft:{ display:'flex', alignItems:'center', gap:10 },
  headerRight:{ display:'flex', alignItems:'center', gap:8 },
  logoBox:   { width:30, height:30, background:'#2563ff', borderRadius:7, display:'flex', alignItems:'center', justifyContent:'center', fontSize:13, fontWeight:700, color:'#fff', flexShrink:0 },
  modeWrap:  { display:'flex', background:'#161616', borderRadius:7, padding:2, gap:2, border:'1px solid #1e1e1e' },
  modeBtn:   { background:'transparent', border:'none', color:'#555', fontSize:11, fontWeight:500, padding:'4px 8px', borderRadius:5, cursor:'pointer', fontFamily:'Noto Sans KR, sans-serif' },
  modeBtnActive:{ background:'#202020', color:'#e0e0e0', fontWeight:600 },
  iconBtn:   { background:'#181818', border:'1px solid #222', borderRadius:7, width:30, height:30, cursor:'pointer', color:'#888', fontSize:13, display:'flex', alignItems:'center', justifyContent:'center' },

  // 메시지
  msgArea:   { flex:1, overflowY:'auto', padding:'20px 20px', display:'flex', flexDirection:'column', gap:16 },
  msgRow:    { display:'flex', alignItems:'flex-end', gap:8 },
  aiAvatar:  { width:28, height:28, background:'#2563ff', borderRadius:7, display:'flex', alignItems:'center', justifyContent:'center', fontSize:12, fontWeight:700, color:'#fff', flexShrink:0, marginBottom:2 },
  userAvatar:{ width:28, height:28, background:'#222', borderRadius:7, display:'flex', alignItems:'center', justifyContent:'center', fontSize:11, fontWeight:600, color:'#666', flexShrink:0, marginBottom:2, border:'1px solid #2a2a2a' },
  bubble:    { padding:'10px 14px', borderRadius:14, fontSize:13.5, lineHeight:1.7, wordBreak:'keep-all' },
  bubbleUser:{ background:'#2563ff', color:'#fff', borderRadius:'14px 14px 4px 14px' },
  bubbleAi:  { background:'#1a1f2e', border:'1px solid #2e3a55', color:'#e8eaf0', borderRadius:'4px 14px 14px 14px' },
  bubbleErr: { background:'#1a0a0a', border:'1px solid #3a1a1a', color:'#f87171' },
  msgActions:{ display:'flex', justifyContent:'flex-start', marginTop:4, paddingLeft:2 },
  copyBtn:   { background:'transparent', border:'1px solid #2a2a2a', borderRadius:6, padding:'3px 10px', fontSize:11, color:'#555', cursor:'pointer', fontFamily:'Noto Sans KR, sans-serif' },
  stepText:  { fontSize:11, color:'#7eb8ff', fontStyle:'italic' },
  sourcesWrap:  { marginTop:6, background:'#111827', border:'1px solid #2e3a55', borderRadius:8, padding:'8px 12px' },
  sourcesLabel: { fontSize:10, fontWeight:600, color:'#5a7aaa', textTransform:'uppercase', letterSpacing:'0.8px', marginBottom:6 },
  sourceItem:   { display:'flex', gap:6, alignItems:'baseline', padding:'3px 0', borderBottom:'1px solid #1e2a40' },
  sourceNum:    { fontSize:10, color:'#5a7aaa', flexShrink:0, minWidth:14 },
  sourceLink:   { fontSize:11, color:'#7eb8ff', textDecoration:'none', wordBreak:'break-all', lineHeight:1.5 },

  // 입력
  inputArea: { padding:'10px 16px 16px', background:'#0f0f0f', borderTop:'1px solid #1a1a1a', flexShrink:0 },
  chipRow:   { display:'flex', gap:5, alignItems:'center', marginBottom:6, flexWrap:'wrap' },
  chipLabel: { fontSize:10, color:'#444' },
  chip:      { fontSize:11, fontWeight:600, padding:'2px 8px', borderRadius:20 },
  inputRow:  { display:'flex', gap:8, alignItems:'flex-end' },
  textarea:  { flex:1, background:'#161616', border:'1px solid #252525', borderRadius:12, color:'#e0e0e0', fontSize:13.5, fontFamily:'Noto Sans KR, sans-serif', padding:'10px 14px', resize:'none', outline:'none', lineHeight:1.6, maxHeight:140, overflowY:'auto' },
  sendBtn:   { width:40, height:40, background:'#2563ff', border:'none', borderRadius:10, cursor:'pointer', color:'#fff', display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0 },

  // 대화 기록
  histItem:  { background:'#141414', border:'1px solid #1e1e1e', borderRadius:7, padding:'7px 10px', marginBottom:5, cursor:'pointer' },
};
