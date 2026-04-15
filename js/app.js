/* ============================================
   SR. OSVALDO - App Logic v4.0
   Automação Total: PDF → Análise → Vagas → Carta
   ============================================ */

const AppState = {
  currentPage: 'home',
  uploadedFile: null,
  uploadedFileBytes: null,
  resumeText: '',
  analysisResult: null,
  optimizedResume: null,
  candidateProfile: null,
  applications: [],
  jobCoverLetters: {},
  aiServiceReady: false,
  aiServiceMessage: 'IA indisponivel no momento.',
  aiServiceModel: '',
  aiLastUserError: '',
};

const DEFAULT_AI_ENDPOINT = 'https://sr-osvaldo-ai.srosvaldo.workers.dev';

function safeStorageGet(key) {
  try {
    return localStorage.getItem(key);
  } catch (error) {
    return '';
  }
}

function safeStorageSet(key, value) {
  try {
    localStorage.setItem(key, value);
  } catch (error) {
    return false;
  }
  return true;
}

function ensureDefaultAiEndpoint() {
  const currentEndpoint = String(window.SR_OSVALDO_AI_ENDPOINT || safeStorageGet('sr_osvaldo_ai_endpoint') || '').trim();
  if (!currentEndpoint) {
    window.SR_OSVALDO_AI_ENDPOINT = DEFAULT_AI_ENDPOINT;
    safeStorageSet('sr_osvaldo_ai_endpoint', DEFAULT_AI_ENDPOINT);
    return DEFAULT_AI_ENDPOINT;
  }

  if (!window.SR_OSVALDO_AI_ENDPOINT) {
    window.SR_OSVALDO_AI_ENDPOINT = currentEndpoint;
  }

  return currentEndpoint.replace(/\/$/, '');
}

// PDF.JS
if (typeof pdfjsLib !== 'undefined') {
  pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
}

// IA SERVICE (backend/proxy)
function getAiProxyEndpoint() {
  return ensureDefaultAiEndpoint();
}

function getAiHealthUrl() {
  const base = getAiProxyEndpoint();
  return base ? `${base}/api/health` : '';
}

function getAiGeminiUrl() {
  const base = getAiProxyEndpoint();
  return base ? `${base}/api/gemini` : '';
}

function isAiEndpointConfigured() {
  const endpoint = getAiProxyEndpoint();
  return Boolean(endpoint && /^https?:\/\//i.test(endpoint));
}

function getAiEndpointInput() {
  return document.getElementById('apiEndpointInput');
}

function getGoogleClientId() {
  return String(window.SR_OSVALDO_GOOGLE_CLIENT_ID || safeStorageGet('sr_osvaldo_google_client_id') || '').trim();
}

function getGoogleAllowedOrigins() {
  const configured = window.SR_OSVALDO_GOOGLE_ALLOWED_ORIGINS;
  if (!Array.isArray(configured)) return [];
  return configured
    .map((origin) => String(origin || '').trim())
    .filter(Boolean);
}

function updateGoogleLoginHint(message = '', type = 'info') {
  const container = document.getElementById('googleSignInButton');
  if (!container) return;

  let hint = document.getElementById('googleSignInHint');
  if (!hint) {
    hint = document.createElement('p');
    hint.id = 'googleSignInHint';
    hint.style.margin = '8px 0 0';
    hint.style.fontSize = '.78rem';
    hint.style.lineHeight = '1.45';
    hint.style.textAlign = 'left';
    hint.style.color = '#64748b';
    container.insertAdjacentElement('afterend', hint);
  }

  if (!message) {
    hint.textContent = '';
    hint.style.display = 'none';
    return;
  }

  hint.style.display = 'block';
  hint.textContent = message;
  hint.style.color = type === 'error' ? '#b91c1c' : '#64748b';
}

function updateGoogleOriginDiagnosticsHint() {
  if (!isGoogleLoginConfigured()) {
    updateGoogleLoginHint('Login Google desativado: configure SR_OSVALDO_GOOGLE_CLIENT_ID.', 'error');
    return;
  }

  const allowedOrigins = getGoogleAllowedOrigins();
  if (!allowedOrigins.length) {
    updateGoogleLoginHint('Se ocorrer origin_mismatch, cadastre a origem atual no Google Cloud OAuth.', 'info');
    return;
  }

  const currentOrigin = window.location.origin;
  const isAllowed = allowedOrigins.includes(currentOrigin);
  if (isAllowed) {
    updateGoogleLoginHint('', 'info');
    return;
  }

  updateGoogleLoginHint(
    `A origem atual (${currentOrigin}) nao esta na lista recomendada de OAuth. Adicione esta origem no Google Cloud para evitar Error 400 origin_mismatch.`,
    'error'
  );
}

function getGoogleAuthUrl() {
  const base = getAiProxyEndpoint();
  return base ? `${base}/api/auth/google` : '';
}

function isGoogleLoginConfigured() {
  return Boolean(getGoogleClientId());
}

function getCurrentAiEndpointValue() {
  const input = getAiEndpointInput();
  if (input && typeof input.value === 'string') {
    return input.value.trim();
  }
  return getAiProxyEndpoint();
}

function getAuthApiBase() {
  return getAiProxyEndpoint();
}

function getAuthApiUrl(pathname) {
  const base = getAuthApiBase();
  return base ? `${base}${pathname}` : '';
}

function getSignupFeedbackEl() {
  return document.getElementById('signupFeedback');
}

function setSignupModalFeedback(message = '', type = 'info') {
  const el = getSignupFeedbackEl();
  if (!el) return;
  if (!message) {
    el.textContent = '';
    el.className = 'api-feedback';
    return;
  }
  el.textContent = message;
  el.className = `api-feedback visible ${type}`;
}

function setSignupButtonLoading(isLoading) {
  const btn = document.getElementById('signupSaveBtn');
  if (!btn) return;
  btn.disabled = isLoading;
  btn.textContent = isLoading ? '⏳ Criando...' : 'Criar conta';
}

function openSignupModal() {
  const modal = document.getElementById('signupModal');
  if (!modal) return;
  modal.style.display = 'flex';
  setSignupModalFeedback('', 'info');
  setSignupButtonLoading(false);
}

function closeSignupModal() {
  const modal = document.getElementById('signupModal');
  if (modal) modal.style.display = 'none';
}

function handlePasswordRecovery() {
  showToast('Recuperação de senha ainda não configurada. Use Criar Conta para registrar um novo acesso.', 'info');
}

function normalizeEmail(email) {
  return String(email || '').trim().toLowerCase();
}

function validatePasswordStrength(password) {
  const value = String(password || '');
  if (value.length < 8) return 'A senha precisa ter pelo menos 8 caracteres.';
  return '';
}

function saveAiEndpoint(endpoint) {
  const normalized = String(endpoint || '').trim().replace(/\/$/, '');
  if (normalized) {
    localStorage.setItem('sr_osvaldo_ai_endpoint', normalized);
    window.SR_OSVALDO_AI_ENDPOINT = normalized;
  } else {
    localStorage.removeItem('sr_osvaldo_ai_endpoint');
    window.SR_OSVALDO_AI_ENDPOINT = '';
  }
  updateApiStatus();
  return normalized;
}

function setLoggedInUser(user, provider = 'local') {
  const email = String(user?.email || '').trim();
  const name = String(user?.name || email || '').trim();
  const picture = String(user?.picture || '').trim();

  sessionStorage.setItem('sr_osvaldo_session', 'true');
  localStorage.setItem('sr_osvaldo_user', email || name || 'user');
  localStorage.setItem('sr_osvaldo_user_name', name || email || 'Usuário');
  localStorage.setItem('sr_osvaldo_user_picture', picture);
  localStorage.setItem('sr_osvaldo_auth_provider', provider);
}

async function handleSignup() {
  const name = document.getElementById('signupName')?.value.trim() || '';
  const email = normalizeEmail(document.getElementById('signupEmail')?.value);
  const password = document.getElementById('signupPassword')?.value || '';
  const confirmPassword = document.getElementById('signupPasswordConfirm')?.value || '';

  if (!name) {
    setSignupModalFeedback('Informe seu nome.', 'error');
    return;
  }
  if (!email || !email.includes('@')) {
    setSignupModalFeedback('Informe um e-mail válido.', 'error');
    return;
  }

  const passwordError = validatePasswordStrength(password);
  if (passwordError) {
    setSignupModalFeedback(passwordError, 'error');
    return;
  }

  if (password !== confirmPassword) {
    setSignupModalFeedback('As senhas não coincidem.', 'error');
    return;
  }

  let authUrl = getAuthApiUrl('/api/auth/register');
  if (!authUrl) {
    window.SR_OSVALDO_AI_ENDPOINT = DEFAULT_AI_ENDPOINT;
    safeStorageSet('sr_osvaldo_ai_endpoint', DEFAULT_AI_ENDPOINT);
    authUrl = `${DEFAULT_AI_ENDPOINT}/api/auth/register`;
  }

  setSignupButtonLoading(true);
  try {
    const response = await fetch(authUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, email, password }),
    });
    const data = await response.json();
    if (!response.ok || !data?.ok) {
      throw new Error(data?.error || data?.message || 'Falha ao criar conta.');
    }

    setLoggedInUser(data.user || { email, name }, 'password');
    closeSignupModal();
    document.getElementById('loginGate').classList.add('hidden');
    showToast('Conta criada com sucesso! 🎩', 'success');
  } catch (error) {
    setSignupModalFeedback(String(error?.message || 'Falha ao criar conta.'), 'error');
  } finally {
    setSignupButtonLoading(false);
  }
}

async function handleLogin() {
  const emailInput = document.getElementById('loginEmail');
  const passwordInput = document.querySelector('#loginGate input[type="password"]');
  const email = normalizeEmail(emailInput?.value || '');
  const password = passwordInput?.value || '';

  if (!email || !email.includes('@')) {
    showToast('Informe um e-mail válido.', 'error');
    return;
  }
  if (!password) {
    showToast('Informe sua senha.', 'error');
    return;
  }

  let authUrl = getAuthApiUrl('/api/auth/password');
  if (!authUrl) {
    window.SR_OSVALDO_AI_ENDPOINT = DEFAULT_AI_ENDPOINT;
    safeStorageSet('sr_osvaldo_ai_endpoint', DEFAULT_AI_ENDPOINT);
    authUrl = `${DEFAULT_AI_ENDPOINT}/api/auth/password`;
  }

  const loginBtn = document.querySelector('.login-btn-submit');
  if (loginBtn) {
    loginBtn.disabled = true;
    loginBtn.textContent = '⏳ Entrando...';
  }

  try {
    const response = await fetch(authUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password }),
    });
    const data = await response.json();
    if (!response.ok || !data?.ok) {
      throw new Error(data?.error || data?.message || 'E-mail ou senha inválidos.');
    }

    setLoggedInUser(data.user || { email }, 'password');
    document.getElementById('loginGate').classList.add('hidden');
    showToast(`Bem-vindo, ${data.user?.name || data.user?.email || 'usuário'}!`, 'success');
  } catch (error) {
    showToast(String(error?.message || 'Falha ao entrar.'), 'error');
  } finally {
    if (loginBtn) {
      loginBtn.disabled = false;
      loginBtn.textContent = 'Entrar';
    }
  }
}

function handleGoogleCredentialResponse(response) {
  return verifyGoogleLogin(response?.credential || '');
}

async function verifyGoogleLogin(credential) {
  if (!credential) {
    showToast('Nao foi possivel obter credencial do Google.', 'error');
    return false;
  }

  let authUrl = getGoogleAuthUrl();
  if (!authUrl) {
    window.SR_OSVALDO_AI_ENDPOINT = DEFAULT_AI_ENDPOINT;
    safeStorageSet('sr_osvaldo_ai_endpoint', DEFAULT_AI_ENDPOINT);
    authUrl = `${DEFAULT_AI_ENDPOINT}/api/auth/google`;
  }

  try {
    const response = await fetch(authUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ credential }),
    });
    const data = await response.json();
    if (!response.ok || !data?.ok) {
      throw new Error(data?.error || data?.message || 'Falha ao validar login Google.');
    }

    setLoggedInUser(data.user || {});
    document.getElementById('loginGate').classList.add('hidden');
    showToast(`Bem-vindo, ${data.user?.name || data.user?.email || 'usuário'}!`, 'success');
    return true;
  } catch (error) {
    console.error('Google login error:', error);
    showToast(String(error?.message || 'Falha no login Google.'), 'error');
    return false;
  }
}

function initGoogleIdentity() {
  if (!window.google?.accounts?.id) return false;
  updateGoogleOriginDiagnosticsHint();
  if (!isGoogleLoginConfigured()) return false;

  try {
    window.google.accounts.id.initialize({
      client_id: getGoogleClientId(),
      callback: handleGoogleCredentialResponse,
    });

    const container = document.getElementById('googleSignInButton');
    if (container && !window.__srOsvaldoGoogleButtonRendered) {
      const width = Math.max(220, Math.min(360, container.clientWidth || 360));
      container.innerHTML = '';
      window.google.accounts.id.renderButton(container, {
        type: 'standard',
        theme: 'outline',
        size: 'large',
        text: 'continue_with',
        shape: 'rectangular',
        width,
      });
      window.__srOsvaldoGoogleButtonRendered = true;
    }

    window.__srOsvaldoGoogleReady = true;
    return true;
  } catch (error) {
    console.error('Google Identity init error:', error);
    return false;
  }
}

function classifyAiServiceError(message = '') {
  const msg = String(message || '');
  const lower = msg.toLowerCase();

  if (/quota diaria|quota|rate limit|retry/i.test(lower)) {
    return '';
  }
  if (/captcha/i.test(lower)) {
    return 'A verificacao de seguranca bloqueou a requisicao. Recarregue a pagina e tente novamente.';
  }
  if (/endpoint de ia nao configurado|health check/i.test(lower)) {
    return 'Servico de IA ainda nao configurado no servidor.';
  }
  return msg || 'Servico de IA indisponivel no momento.';
}

async function callGemini(prompt, isJson = false) {
  const aiGeminiUrl = getAiGeminiUrl();
  if (!AppState.aiServiceReady || !aiGeminiUrl) return null;
  try {
    const r = await fetch(aiGeminiUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ prompt, isJson }),
    });
    if (!r.ok) {
      const errText = await r.text();
      let msg = `Erro ${r.status} no servico de IA`;
      try {
        const j = JSON.parse(errText);
        if (j?.error) msg = j.error;
        if (j?.message) msg = j.message;
      } catch(e) {}
      throw new Error(msg);
    }
    const d = await r.json();
    return d?.text || null;
  } catch (e) {
    console.error('IA Service:', e);
    const raw = String(e?.message || 'Falha no servico de IA.');
    const userMessage = classifyAiServiceError(raw);
    AppState.aiLastUserError = userMessage;
    if (!/quota|rate limit|captcha/i.test(raw.toLowerCase())) {
      AppState.aiServiceReady = false;
    }
    AppState.aiServiceMessage = userMessage || AppState.aiServiceMessage;
    updateApiStatus();
    if (userMessage) {
      showToast(userMessage, 'error');
      return `[ERRO] ${e.message}`;
    }
    return null;
  }
}

// IA STATUS MODAL
function setApiModalFeedback(message = '', type = 'info') {
  const el = document.getElementById('apiKeyFeedback');
  if (!el) return;
  if (!message) {
    el.textContent = '';
    el.className = 'api-feedback';
    return;
  }
  el.textContent = message;
  el.className = `api-feedback visible ${type}`;
}

function setApiCheckButtonLoading(isLoading) {
  const btn = document.getElementById('apiSaveBtn');
  if (!btn) return;
  btn.disabled = isLoading;
  btn.textContent = isLoading ? '⏳ Testando conexao...' : '🔄 Testar Conexao IA';
}

function showApiKeyModal() {
  document.getElementById('apiKeyModal').classList.add('visible');
  const input = getAiEndpointInput();
  if (input) {
    input.value = getAiProxyEndpoint();
  }
  setApiCheckButtonLoading(false);
  if (!isAiEndpointConfigured()) {
    setApiModalFeedback('Configure a URL do Worker para ativar a IA. Nenhuma chave e pedida no navegador.', 'error');
    return;
  }
  const model = AppState.aiServiceModel ? ` Modelo: ${AppState.aiServiceModel}.` : '';
  const current = AppState.aiServiceReady
    ? `Servico de IA conectado.${model}`
    : (AppState.aiServiceMessage || 'Servico de IA ainda nao conectado.');
  setApiModalFeedback(current, AppState.aiServiceReady ? 'success' : 'info');
}
function closeApiKeyModal() { document.getElementById('apiKeyModal').classList.remove('visible'); }

async function checkAiServiceConnection(showFeedback = false) {
  if (!isAiEndpointConfigured()) {
    AppState.aiServiceReady = false;
    AppState.aiServiceModel = '';
    AppState.aiServiceMessage = 'Endpoint de IA nao configurado.';
    updateApiStatus();
    if (showFeedback) {
      setApiModalFeedback('Configure a URL do Worker antes de testar a IA.', 'error');
      showToast('Endpoint de IA nao configurado.', 'error');
    }
    return false;
  }

  setApiCheckButtonLoading(true);
  try {
    const r = await fetch(getAiHealthUrl(), { method: 'GET' });
    const data = await r.json();
    if (!r.ok || !data?.ok) {
      throw new Error(data?.message || `Erro ${r.status} no health check de IA.`);
    }

    AppState.aiServiceReady = true;
    AppState.aiServiceModel = data.model || '';
    AppState.aiServiceMessage = 'Servico de IA conectado.';
    updateApiStatus();
    if (showFeedback) {
      const model = AppState.aiServiceModel ? ` Modelo: ${AppState.aiServiceModel}.` : '';
      setApiModalFeedback(`Servico de IA conectado com sucesso.${model}`, 'success');
      showToast('Conexao com IA ativa.', 'success');
    }
    return true;
  } catch (e) {
    AppState.aiServiceReady = false;
    AppState.aiServiceModel = '';
    AppState.aiServiceMessage = String(e?.message || 'Falha ao conectar no servico de IA.');
    updateApiStatus();
    if (showFeedback) {
      setApiModalFeedback(`Erro na conexao IA: ${AppState.aiServiceMessage}`, 'error');
      showToast('Falha ao conectar no servico de IA.', 'error');
    }
    return false;
  } finally {
    setApiCheckButtonLoading(false);
  }
}

function updateApiStatus() {
  const icon = document.getElementById('apiStatusIcon');
  const btn = document.getElementById('apiStatusBtn');
  if (!icon) return;
  if (!isAiEndpointConfigured()) {
    icon.textContent = '🔴';
    if (btn) btn.title = 'Endpoint IA nao configurado';
    return;
  }
  if (AppState.aiServiceReady) {
    icon.textContent = '🟢';
    if (btn) btn.title = AppState.aiServiceModel ? `IA ativa (${AppState.aiServiceModel})` : 'IA ativa';
    return;
  }
  icon.textContent = '🟡';
  if (btn) btn.title = 'IA conectando';
}

async function restoreAndValidateSavedApiKey() {
  return checkAiServiceConnection(false);
}

async function saveEndpointAndTest() {
  const endpoint = saveAiEndpoint(getCurrentAiEndpointValue());
  if (!endpoint) {
    setApiModalFeedback('Informe a URL do Worker para continuar.', 'error');
    showToast('Informe a URL do Worker.', 'error');
    return false;
  }

  const ok = await checkAiServiceConnection(true);
  if (!ok) {
    setApiModalFeedback('Endpoint salvo, mas a IA ainda nao respondeu. Verifique a URL e o Worker.', 'error');
  }
  return ok;
}

// JOBS DB
const JOBS_DB = [
  { id:1, title:'Desenvolvedor Full Stack', company:'TechNova Brasil', logo:'🟢', logoBg:'#059669', location:'Remoto', salary:'R$ 8.000 - 14.000', description:'Projetos inovadores usando React, Node.js e PostgreSQL.', tags:['React','Node.js','PostgreSQL','TypeScript','JavaScript'], posted:'2 dias atrás', source:'LinkedIn', url:'https://linkedin.com/jobs' },
  { id:2, title:'Frontend Developer (React)', company:'GlobalTech Solutions', logo:'🔵', logoBg:'#2563EB', location:'Remoto — Internacional', salary:'USD 3.000 - 5.000/mês', description:'Building cutting-edge web applications with React and TypeScript.', tags:['React','TypeScript','CSS','JavaScript','English'], posted:'1 dia atrás', source:'RemoteOK', url:'https://remoteok.com' },
  { id:3, title:'Analista de Dados', company:'DataMinds', logo:'🟣', logoBg:'#7C3AED', location:'Remoto', salary:'R$ 6.000 - 10.000', description:'Experiência em Python, SQL e Power BI.', tags:['Python','SQL','Power BI','Excel','Análise de Dados'], posted:'3 dias atrás', source:'Gupy', url:'https://gupy.io' },
  { id:4, title:'UX/UI Designer Freelancer', company:'DesignHub', logo:'🟠', logoBg:'#EA580C', location:'Remoto — Freelance', salary:'R$ 80 - 150/hora', description:'Redesign de aplicativo mobile com Figma.', tags:['Figma','UI Design','Mobile','Design System','UX'], posted:'5 horas atrás', source:'Workana', url:'https://workana.com' },
  { id:5, title:'DevOps Engineer', company:'CloudFirst', logo:'🔴', logoBg:'#DC2626', location:'Remoto', salary:'R$ 12.000 - 18.000', description:'AWS, Docker, Kubernetes e CI/CD pipelines.', tags:['AWS','Docker','Kubernetes','CI/CD','Linux','Terraform'], posted:'1 semana atrás', source:'Indeed', url:'https://indeed.com.br' },
  { id:6, title:'Backend Developer (Python)', company:'FinanceApp', logo:'🟡', logoBg:'#CA8A04', location:'São Paulo — Híbrido', salary:'R$ 10.000 - 15.000', description:'Python/Django para fintech em crescimento.', tags:['Python','Django','REST API','PostgreSQL','Flask'], posted:'4 dias atrás', source:'Glassdoor', url:'https://glassdoor.com.br' },
  { id:7, title:'Mobile Developer (React Native)', company:'AppForge', logo:'🔶', logoBg:'#0891B2', location:'Remoto — Internacional', salary:'USD 4.000 - 6.000/mês', description:'Cross-platform mobile apps com React Native.', tags:['React Native','JavaScript','iOS','Android','Mobile'], posted:'2 dias atrás', source:'WeWorkRemotely', url:'https://weworkremotely.com' },
  { id:8, title:'Redator de Conteúdo Tech', company:'ContentLab', logo:'📝', logoBg:'#059669', location:'Remoto — Freelance', salary:'R$ 50 - 100/artigo', description:'Conteúdo técnico para blogs. SEO e escrita técnica.', tags:['Redação','SEO','Marketing','Tech','Comunicação'], posted:'6 horas atrás', source:'99Freelas', url:'https://99freelas.com.br' },
  { id:9, title:'Scrum Master', company:'AgileWorks', logo:'🟩', logoBg:'#16A34A', location:'Remoto', salary:'R$ 9.000 - 13.000', description:'Facilitador Scrum. Certificação CSM/PSM desejável.', tags:['Scrum','Agile','Jira','Liderança','Gestão'], posted:'3 dias atrás', source:'Catho', url:'https://catho.com.br' },
  { id:10, title:'Data Engineer', company:'BigData Corp', logo:'🔷', logoBg:'#4F46E5', location:'Remoto — CLT', salary:'R$ 14.000 - 20.000', description:'Pipelines ETL com Spark, Airflow e AWS.', tags:['Spark','Airflow','AWS','Python','Big Data','SQL'], posted:'1 dia atrás', source:'LinkedIn', url:'https://linkedin.com/jobs' },
  { id:11, title:'Product Designer Senior', company:'Nubank', logo:'💜', logoBg:'#820AD1', location:'Remoto — CLT', salary:'R$ 15.000 - 22.000', description:'Design de produto para experiência do cliente.', tags:['Figma','Research','Product Design','Prototyping','UX'], posted:'12 horas atrás', source:'LinkedIn', url:'https://linkedin.com/jobs' },
  { id:12, title:'WordPress Developer', company:'WebFactory', logo:'🌐', logoBg:'#0284C7', location:'Remoto — Freelance', salary:'R$ 3.000 - 6.000/projeto', description:'Sites WordPress com customização.', tags:['WordPress','PHP','CSS','JavaScript','HTML'], posted:'2 dias atrás', source:'Workana', url:'https://workana.com' },
  { id:13, title:'Engenheiro de Software Java', company:'BankTech', logo:'🏦', logoBg:'#1E40AF', location:'Remoto — CLT', salary:'R$ 12.000 - 18.000', description:'Microsserviços em Java/Spring Boot para financeiro.', tags:['Java','Spring Boot','Microservices','SQL','REST API'], posted:'1 dia atrás', source:'Gupy', url:'https://gupy.io' },
  { id:14, title:'Especialista em Cybersecurity', company:'SecureNet', logo:'🛡️', logoBg:'#991B1B', location:'Remoto', salary:'R$ 15.000 - 25.000', description:'Pentesting e compliance de segurança.', tags:['Cybersecurity','Pentesting','Linux','Firewall','SIEM'], posted:'3 dias atrás', source:'Indeed', url:'https://indeed.com.br' },
  { id:15, title:'Machine Learning Engineer', company:'AI Labs', logo:'🧠', logoBg:'#6D28D9', location:'Remoto — Internacional', salary:'USD 5.000 - 8.000/mês', description:'Build and deploy ML models at scale.', tags:['Python','Machine Learning','TensorFlow','AWS','Data Science'], posted:'2 dias atrás', source:'RemoteOK', url:'https://remoteok.com' },
  { id:16, title:'Analista de Infraestrutura', company:'InfraCloud', logo:'🖥️', logoBg:'#334155', location:'Remoto', salary:'R$ 7.000 - 12.000', description:'Suporte a infraestrutura cloud com VMware e Windows Server.', tags:['VMware','Windows Server','Active Directory','Azure','Networking'], posted:'1 dia atrás', source:'Catho', url:'https://catho.com.br' },
  { id:17, title:'Analista de Redes e Segurança', company:'NetGuard', logo:'🔒', logoBg:'#0F766E', location:'Remoto — CLT', salary:'R$ 10.000 - 16.000', description:'Administração de firewalls Fortinet/Palo Alto.', tags:['Fortinet','FortiGate','Palo Alto','Firewall','Networking','Linux'], posted:'2 dias atrás', source:'LinkedIn', url:'https://linkedin.com/jobs' },
  { id:18, title:'Consultor Power Platform', company:'Microsoft Partner', logo:'Ⓜ️', logoBg:'#0078D4', location:'Remoto', salary:'R$ 12.000 - 18.000', description:'Desenvolvimento de soluções com Power Apps e Power Automate.', tags:['Power Apps','Power Automate','SharePoint','Office 365','Azure'], posted:'3 dias atrás', source:'LinkedIn', url:'https://linkedin.com/jobs' },
];

// CATEGORIES
const CATEGORIES = [
  { name:'Formatação', icon:'📝', key:'formatting' },
  { name:'Experiência', icon:'💼', key:'experience' },
  { name:'Formação', icon:'🎓', key:'education' },
  { name:'Habilidades', icon:'🔧', key:'skills' },
  { name:'Idiomas', icon:'🌐', key:'languages' },
  { name:'Mercado/ATS', icon:'📊', key:'market' },
  { name:'Objetivo', icon:'🎯', key:'objective' },
];

const ALL_SKILLS = [
  'javascript','typescript','python','java','c#','c++','php','ruby','go','rust','swift','kotlin',
  'react','angular','vue','next.js','node.js','express','django','flask','spring boot','laravel',
  'react native','flutter','ios','android','mobile',
  'sql','postgresql','mysql','mongodb','redis','firebase',
  'aws','azure','gcp','docker','kubernetes','terraform','ci/cd','devops',
  'html','css','sass','tailwind','git','linux','agile','scrum','jira',
  'figma','ui design','ux','design system','product design','prototyping',
  'machine learning','data science','tensorflow','pytorch',
  'power bi','excel','análise de dados','big data','spark','airflow',
  'rest api','graphql','microservices','seo','marketing','redação','comunicação',
  'liderança','gestão','cybersecurity','pentesting','firewall','siem','wordpress',
  'fortinet','fortigate','palo alto','checkpoint','redes','networking','windows server',
  'vmware','nutanix','active directory','office 365','sharepoint','power automate','power apps',
];

// ===== NAVIGATION =====
function navigateTo(page) {
  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
  document.getElementById(`page-${page}`)?.classList.add('active');
  document.querySelectorAll('.navbar-links a').forEach(l => { l.classList.remove('active'); if (l.dataset.page === page) l.classList.add('active'); });
  document.getElementById('navLinks').classList.remove('open');
  AppState.currentPage = page;
  window.scrollTo({ top: 0, behavior: 'smooth' });

  if (page === 'jobs') renderJobs();
  else if (page === 'dashboard') renderDashboard();
  else if (page === 'analysis' && AppState.analysisResult) animateAnalysis();
  else if (page === 'coach') setTimeout(() => document.getElementById('coachInput')?.focus(), 100);
}
function toggleMobileMenu() { document.getElementById('navLinks').classList.toggle('open'); }
function scrollToFeatures() { document.getElementById('featuresSection')?.scrollIntoView({ behavior:'smooth' }); }

// ===== FILE UPLOAD =====
function initDropzone() {
  const dz = document.getElementById('dropzone');
  if (!dz) return;
  ['dragenter','dragover'].forEach(e => dz.addEventListener(e, ev => { ev.preventDefault(); dz.classList.add('dragover'); }));
  ['dragleave','drop'].forEach(e => dz.addEventListener(e, ev => { ev.preventDefault(); dz.classList.remove('dragover'); }));
  dz.addEventListener('drop', e => { if (e.dataTransfer.files.length) processFile(e.dataTransfer.files[0]); });
}
function handleFileSelect(e) { if (e.target.files[0]) processFile(e.target.files[0]); }

async function processFile(file) {
  if (!/\.(pdf|txt|doc|docx)$/i.test(file.name)) { showToast('Formato não suportado.', 'error'); return; }
  AppState.uploadedFile = file;
  AppState.uploadedFileBytes = await file.arrayBuffer();
  document.getElementById('fileName').textContent = file.name;
  document.getElementById('fileSize').textContent = formatSize(file.size);
  document.getElementById('filePreview').classList.add('visible');

  if (file.name.endsWith('.pdf')) {
    showToast('Extraindo texto do PDF...', 'info');
    try {
      const text = await extractPDFText(file);
      if (text && text.trim().length > 10) {
        document.getElementById('resumeText').value = text;
        showToast('PDF lido com sucesso! ✅', 'success');
      }
    } catch (e) { console.error(e); showToast('Cole o texto manualmente se necessário.', 'info'); }
  } else if (file.name.endsWith('.txt')) {
    const r = new FileReader();
    r.onload = ev => { document.getElementById('resumeText').value = ev.target.result; showToast('Texto extraído!', 'success'); };
    r.readAsText(file);
  }
}

async function extractPDFText(file) {
  const ab = await file.arrayBuffer();
  const pdf = await pdfjsLib.getDocument({ data: ab }).promise;
  let t = '';
  for (let i = 1; i <= pdf.numPages; i++) {
    const pg = await pdf.getPage(i);
    const c = await pg.getTextContent();
    t += c.items.map(x => x.str).join(' ') + '\n\n';
  }
  return t.trim();
}

function removeFile() {
  AppState.uploadedFile = null; AppState.uploadedFileBytes = null;
  document.getElementById('filePreview').classList.remove('visible');
  document.getElementById('fileInput').value = '';
}

function formatSize(b) { if (!b) return '0 B'; const k = 1024, s = ['B','KB','MB']; const i = Math.floor(Math.log(b) / Math.log(k)); return (b / Math.pow(k, i)).toFixed(1) + ' ' + s[i]; }

// ===== PROFILE EXTRACTION OMITIDA - FEITA PELO GEMINI =====
function renderProfileCard(p) {
  document.getElementById('profileCard').style.display = 'flex';
  const av = document.getElementById('profileAvatar');
  av.textContent = p.initials || 'C'; av.style.fontSize = '1.5rem'; av.style.fontWeight = '800';
  document.getElementById('profileName').textContent = p.name || 'Candidato';
  document.getElementById('profileRole').textContent = p.role || 'Profissional';
  
  const lnk = document.getElementById('profileLinkedin');
  if (lnk) {
    if (p.linkedinUrl && p.linkedinUrl.toLowerCase() !== 'não encontrado' && p.linkedinUrl.includes('linkedin.com')) {
      lnk.style.display = 'block';
      let url = p.linkedinUrl.startsWith('http') ? p.linkedinUrl : 'https://' + p.linkedinUrl;
      lnk.querySelector('a').href = url;
    } else {
      lnk.style.display = 'none';
    }
  }

  document.getElementById('profileLevel').textContent = p.level || 'Sênior';
  if (p.skills) document.getElementById('profileTags').innerHTML = p.skills.map(s => `<span class="profile-tag">${s}</span>`).join('');
}

// ===== ANALYSIS =====
async function startAnalysis() {
  const text = document.getElementById('resumeText').value.trim();
  
  if (!text) {
    showToast('Aguarde o carregamento do texto ou cole manualmente.', 'warning');
    return;
  }

  if (!AppState.aiServiceReady) {
    showToast('Servico de IA indisponivel. Aguarde e tente novamente.', 'error');
    showApiKeyModal();
    return;
  }

  AppState.uploadLinkedin = document.getElementById('uploadLinkedin')?.value.trim() || '';
  AppState.resumeText = text;
  
  showAgentsOverlay();
}

function showAgentsOverlay() {
  const ov = document.getElementById('analyzingOverlay');
  ov.classList.add('visible');
  const agents = [
    { id:'agent-format', s:'Analisando formatação...' },
    { id:'agent-experience', s:'Avaliando experiências...' },
    { id:'agent-education', s:'Verificando formação...' },
    { id:'agent-skills', s:'Mapeando habilidades...' },
    { id:'agent-jobs', s:'Buscando vagas compatíveis...' },
  ];
  agents.forEach(a => { const el = document.getElementById(a.id); el.classList.remove('active','done'); el.querySelector('.agent-status').innerHTML = '<span class="dot"></span> Aguardando...'; });

  let step = 0;
  function next() {
    if (step > 0) { const p = document.getElementById(agents[step-1].id); p.classList.remove('active'); p.classList.add('done'); p.querySelector('.agent-status').innerHTML = '<span class="dot"></span> Concluído ✅'; }
    if (step < agents.length) {
      const a = agents[step]; const el = document.getElementById(a.id);
      el.classList.add('active'); el.querySelector('.agent-status').innerHTML = `<span class="dot"></span> ${a.s}`;
      document.getElementById('analyzingText').textContent = a.s;
      step++; setTimeout(next, 700 + Math.random() * 400);
    } else {
      document.getElementById('analyzingText').textContent = 'Gerando relatório final...';
      setTimeout(async () => {
        const ok = await performAnalysis();
        ov.classList.remove('visible');
        if (ok) navigateTo('analysis');
      }, 500);
    }
  }
  next();
}

async function performAnalysis() {
  if (!AppState.aiServiceReady) {
    showToast('Servico de IA indisponivel para analise.', 'error');
    showApiKeyModal();
    return false;
  }

  try {
    showToast('Enviando para inteligência artificial...', 'info');
    const apiResp = await analyzeWithGemini(AppState.resumeText, AppState.uploadLinkedin);
    const r = typeof apiResp === 'object' && apiResp !== null ? apiResp : null;
    if (!r) {
      AppState.analysisResult = null;
      AppState.candidateProfile = null;
      if (AppState.aiLastUserError) {
        showToast(AppState.aiLastUserError, 'warning');
      }
      return false;
    }

    AppState.analysisResult = r;
    if (r.profile && r.profile.name) {
      const pName = r.profile.name || 'Candidato';
      const parts = pName.split(' ');
      r.profile.initials = (parts.length >= 2 ? parts[0][0] + parts[parts.length - 1][0] : pName.substring(0, 2)).toUpperCase();
      if (!r.profile.skills) r.profile.skills = [];
      if (!r.profile.level) r.profile.level = 'Sênior';
      if (!r.profile.role) r.profile.role = 'Especialista';
      AppState.candidateProfile = r.profile;
    }
    return true;
  } catch (e) {
    console.error('Gemini analysis error:', e);
    AppState.analysisResult = null;
    AppState.candidateProfile = null;
    if (AppState.aiLastUserError) {
      showToast(AppState.aiLastUserError, 'warning');
    }
    return false;
  }
}

async function analyzeWithGemini(text, linkedin = '') {
  let extraLinkedin = linkedin ? `Aviso: O usuário informou este link do LinkedIn: ${linkedin}. Substitua qualquer valor encontrado no documento por este ou, se estiver vazio, garanta que este seja colocado.` : '';
  const prompt = `Você é um expert em recrutamento. Analise o texto cru extraído do currículo abaixo e retorne APENAS um JSON válido (sem formatação markdown, sem \`\`\`, sem explicação adicional):
{"totalScore":<0-100>,"scores":{"formatting":<0-100>,"experience":<0-100>,"education":<0-100>,"skills":<0-100>,"languages":<0-100>,"market":<0-100>,"objective":<0-100>},"goodFeedback":["...","...","...","..."],"badFeedback":["...","...","...","...","..."],"improvements":[{"section":"nome","type":"added|modified|removed","text":"descrição"}], "profile": {"name": "Identifique o NOME REAL do profissional (geralmente no topo)", "role": "Identifique o CARGO PRINCIPAL ou PROFISSÃO (ex: Arquiteto de Software, Gerente de TI, etc)", "level": "Nível de Senioridade (ex: Júnior, Pleno, Sênior, Diretor - avalie pelos anos de experiência!)", "linkedinUrl": "Link completo do LinkedIn se encontrado", "skills": ["skill 1", "skill 2", "skill 3", "skill 4", "skill 5", "skill 6", "skill 7", "skill 8"]}, "recommendedJobs": [{"title": "Cargo sugerido", "company": "Empresa Fictícia", "logo": "🏢", "logoBg": "#000000", "location": "Remoto", "salary": "Faixa", "tags": ["skill1", "skill2"], "description": "Breve descrição", "match": 95, "source": "LinkedIn", "url": "https://linkedin.com/jobs"}]}

Instrução CRÍTICA: Extraia o Nome verdadeiro! Não coloque "Candidato". Leia o topo do documento e infira a profissão baseada em toda sua experiência. Além disso, crie NO MÍNIMO 15 vagas impressionantes e detalhadas na chave recommendedJobs. Quero tudo do bom e do melhor: vagas Remoto, Freelance, "Bico"/Projetos Curtos, CLT e Internacional. Todas devem ser hiper relevantes ao perfil provado no CV. ${extraLinkedin}

Currículo: ${text}`;
  const r = await callGemini(prompt, true);
  if (!r || r.startsWith('[ERRO]')) {
    console.error('Gemini falhou na análise de currículo:', r);
    return null;
  }
  try { 
    const cleanStr = r.replace(/```[a-z]*\s*/gi, '').replace(/```/g, '').trim(); 
    const p = JSON.parse(cleanStr); 
    return p.totalScore ? p : null; 
  } catch (e) { 
    console.error('JSON Error:', e, 'Raw API Response:', r); 
    return null; 
  }
}

// ===== RENDER ANALYSIS =====
function animateAnalysis() {
  const r = AppState.analysisResult; if (!r) return;
  if (AppState.candidateProfile) renderProfileCard(AppState.candidateProfile);
  animNum(document.getElementById('scoreNumber'), 0, r.totalScore, 1500);
  setTimeout(() => { document.getElementById('scoreFill').style.strokeDashoffset = 2 * Math.PI * 90 * (1 - r.totalScore / 100); }, 100);
  renderCategories(r.scores);
  renderFeedback(r.goodFeedback, r.badFeedback);
}

function animNum(el, s, e, d) { const rng = e - s, t0 = performance.now(); function u(t) { const p = Math.min((t - t0) / d, 1); el.textContent = Math.round(s + rng * (1 - Math.pow(1-p, 3))); if (p < 1) requestAnimationFrame(u); } requestAnimationFrame(u); }

function renderCategories(scores) {
  const cats = CATEGORIES.map(c => ({ ...c, score: scores[c.key] || 50 }));
  document.getElementById('categoriesGrid').innerHTML = cats.map((c, i) => `
    <div class="category-card animate-in animate-delay-${i+1}">
      <div style="display:flex;justify-content:space-between;margin-bottom:12px;align-items:center">
        <span style="font-weight:700;font-family:'Plus Jakarta Sans',sans-serif;color:var(--text-primary)"><span style="margin-right:8px">${c.icon}</span>${c.name}</span>
        <span style="font-weight:800;color:var(--primary-600)">${c.score}/100</span>
      </div>
      <div class="progress-bar"><div class="progress-fill" style="width:0" data-width="${c.score}%"></div></div>
    </div>`).join('');
  
  setTimeout(() => document.querySelectorAll('.progress-fill').forEach(el => el.style.width = el.dataset.width), 100);
}

function renderFeedback(good, bad) {
  document.getElementById('goodFeedback').innerHTML = good.map((x, i) => `<div class="feedback-card good" style="animation-delay:${i*.1}s"><span class="feedback-card-icon">✅</span><span>${x}</span></div>`).join('');
  document.getElementById('badFeedback').innerHTML = bad.map((x, i) => `<div class="feedback-card bad" style="animation-delay:${i*.1}s"><span class="feedback-card-icon">⚠️</span><span>${x}</span></div>`).join('');
}

// ===== OPTIMIZE =====
async function optimizeResume() {
  if (!AppState.analysisResult) {
    showToast('Faça a análise com IA antes de otimizar.', 'warning');
    return;
  }
  if (!AppState.aiServiceReady) {
    showToast('Servico de IA indisponivel para otimizar.', 'error');
    showApiKeyModal();
    return;
  }
  const ov = document.getElementById('analyzingOverlay');
  document.getElementById('analyzingText').textContent = 'Otimizando currículo...';
  document.getElementById('analyzingSubtext').textContent = 'Agentes aplicando melhorias';
  const steps = [
    { id: 'agent-format', msg: 'Melhorando formatação...' },
    { id: 'agent-experience', msg: 'Reescrevendo experiências...' },
    { id: 'agent-education', msg: 'Ajustando formação...' },
    { id: 'agent-skills', msg: 'Organizando habilidades...' },
    { id: 'agent-jobs', msg: 'Finalizando otimizações...' },
  ].filter(step => document.getElementById(step.id));

  steps.forEach(step => {
    const el = document.getElementById(step.id);
    el.classList.remove('active','done');
    el.querySelector('.agent-status').innerHTML = '<span class="dot"></span> Aguardando...';
  });

  if (!steps.length) {
    await genOptimized();
    navigateTo('resume');
    return;
  }

  ov.classList.add('visible');
  let step = 0;
  function nx() {
    if (step > 0) {
      const prev = document.getElementById(steps[step - 1].id);
      prev.classList.remove('active');
      prev.classList.add('done');
      prev.querySelector('.agent-status').innerHTML = '<span class="dot"></span> Concluído ✅';
    }

    if (step < steps.length) {
      const current = steps[step];
      const el = document.getElementById(current.id);
      el.classList.add('active');
      el.querySelector('.agent-status').innerHTML = `<span class="dot"></span> ${current.msg}`;
      document.getElementById('analyzingText').textContent = current.msg;
      step++;
      setTimeout(nx, 500 + Math.random() * 300);
    } else {
      setTimeout(async () => {
        await genOptimized();
        ov.classList.remove('visible');
        document.getElementById('analyzingText').textContent = 'Analisando...';
        document.getElementById('analyzingSubtext').textContent = 'Nossos 5 agentes estão trabalhando';
        navigateTo('resume');
      }, 400);
    }
  }
  nx();
}

async function genOptimized() {
  const r = AppState.analysisResult, p = AppState.candidateProfile || { name:'Candidato', role:'Profissional', skills:[], level:'Pleno' };
  let imps = r.improvements || [];

  if (!imps.length && AppState.aiServiceReady) {
    const pr = `Liste melhorias para este currículo em JSON puro (sem \`\`\`): [{"section":"nome","type":"added|modified|removed","text":"descrição"}]. Mínimo 5 melhorias. Currículo: ${AppState.resumeText}`;
    const ai = await callGemini(pr);
    if (ai) try { imps = JSON.parse(ai.replace(/```json?\s*/g, '').replace(/```/g, '').trim()); } catch (e) {}
  }

  if (!imps.length) {
    if (AppState.aiLastUserError) {
      showToast(AppState.aiLastUserError, 'warning');
    }
    return;
  }

  AppState.optimizedResume = { original: AppState.resumeText, improvements: imps, profile: p };
  renderOptimizedResume();
}

function renderOptimizedResume() {
  const d = AppState.optimizedResume, imps = d.improvements;
  document.getElementById('addedCount').textContent = imps.filter(i => i.type === 'added').length;
  document.getElementById('modifiedCount').textContent = imps.filter(i => i.type === 'modified').length;
  document.getElementById('removedCount').textContent = imps.filter(i => i.type === 'removed').length;

  document.getElementById('improvementsList').innerHTML = imps.map(i => {
    const icon = i.type === 'added' ? '✅' : i.type === 'removed' ? '🗑️' : '✏️';
    return `<div class="change-item ${i.type}">${icon} <strong>${i.section}:</strong> ${i.text}</div>`;
  }).join('');
  showToast('Currículo otimizado! Pronto para download.', 'success');
}

// ===== PDF DOWNLOAD =====
async function downloadOptimizedPDF() {
  const d = AppState.optimizedResume;
  if (!d) { showToast('Otimize primeiro.', 'error'); return; }
  showToast('Gerando PDF...', 'info');
  try {
    const { PDFDocument, rgb, StandardFonts } = PDFLib;
    let pdf;
    if (AppState.uploadedFileBytes) { try { pdf = await PDFDocument.load(AppState.uploadedFileBytes); } catch (e) { pdf = await PDFDocument.create(); } }
    else { pdf = await PDFDocument.create(); }

    const hel = await pdf.embedFont(StandardFonts.Helvetica);
    const helB = await pdf.embedFont(StandardFonts.HelveticaBold);
    const pg = pdf.addPage([595, 842]);
    const { width, height } = pg.getSize();
    const m = 50; let y = height - 50;

    pg.drawRectangle({ x:0, y:height-80, width, height:80, color:rgb(.063,.725,.506) });
    pg.drawText('MELHORIAS — SR. OSVALDO', { x:m, y:height-45, size:16, font:helB, color:rgb(1,1,1) });
    pg.drawText('7 Agentes Especializados com IA', { x:m, y:height-65, size:10, font:hel, color:rgb(.9,1,.95) });
    y = height - 110;

    const p = d.profile;
    pg.drawText(`${p.name} | ${p.role} | ${p.level}`, { x:m, y, size:11, font:helB, color:rgb(.12,.16,.24) });
    y -= 16;
    if (p.skills.length) { pg.drawText(`Skills: ${p.skills.join(', ')}`, { x:m, y, size:9, font:hel, color:rgb(.39,.46,.56) }); y -= 16; }
    pg.drawText(`Score: ${AppState.analysisResult?.totalScore || 0}/100`, { x:m, y, size:13, font:helB, color:rgb(.063,.725,.506) });
    y -= 25;
    pg.drawLine({ start:{x:m,y}, end:{x:width-m,y}, thickness:1, color:rgb(.063,.725,.506) });
    y -= 20;

    for (const imp of d.improvements) {
      if (y < 80) break;
      const icon = imp.type === 'added' ? '[+]' : imp.type === 'removed' ? '[-]' : '[~]';
      const col = imp.type === 'added' ? rgb(.09,.77,.37) : imp.type === 'removed' ? rgb(.94,.27,.27) : rgb(.96,.62,.04);
      pg.drawText(`${icon} ${imp.section}`, { x:m, y, size:10, font:helB, color:col }); y -= 14;
      const words = imp.text.split(' '); let line = '';
      for (const w of words) { const t = line + (line?' ':'') + w; if (hel.widthOfTextAtSize(t,9) > width-m*2-10) { pg.drawText(line, { x:m+10, y, size:9, font:hel, color:rgb(.39,.46,.56) }); y -= 12; line = w; } else line = t; }
      if (line) { pg.drawText(line, { x:m+10, y, size:9, font:hel, color:rgb(.39,.46,.56) }); y -= 18; }
    }

    pg.drawText('Gerado por Sr. OSvaldo — srosvaldo.com', { x:m, y:30, size:8, font:hel, color:rgb(.58,.64,.72) });
    const bytes = await pdf.save();
    const blob = new Blob([bytes], { type:'application/pdf' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob); a.download = `curriculo_${p.name.replace(/\s+/g,'_').toLowerCase()}_otimizado.pdf`;
    document.body.appendChild(a); a.click(); document.body.removeChild(a);
    showToast('PDF baixado! 📥', 'success');
  } catch (e) { console.error(e); showToast('Erro ao gerar PDF.', 'error'); }
}

// ===== JOB MATCHING (100% AUTOMATIC) =====
function calcMatch(job) {
  const p = AppState.candidateProfile;
  if (!p || !p.skills.length) return 0;
  const ps = p.skills.map(s => s.toLowerCase());
  const jt = job.tags.map(t => t.toLowerCase());
  const rl = AppState.resumeText.toLowerCase();
  let matched = 0;
  jt.forEach(t => { if (ps.includes(t) || rl.includes(t)) matched++; });
  const role = (p.role||'').toLowerCase(), title = job.title.toLowerCase();
  if ((title.includes('develop')||title.includes('desenvolv')) && (role.includes('desenvolv')||role.includes('develop'))) matched += 1;
  if (title.includes('data') && role.includes('dado')) matched += 1;
  if (title.includes('design') && role.includes('design')) matched += 1;
  if (title.includes('devops') && role.includes('devops')) matched += 1;
  if (title.includes('security') && (role.includes('segurança')||role.includes('security'))) matched += 1;
  if (title.includes('infra') && (role.includes('infra')||role.includes('devops'))) matched += 1;
  if (title.includes('redes') && role.includes('redes')) matched += 1;
  if (title.includes('power') && role.includes('power')) matched += 1;
  return clamp(Math.round((matched / Math.max(jt.length, 1)) * 100), 5, 98);
}

async function renderJobs() {
  const needResume = document.getElementById('jobsNeedResume');
  const autoContent = document.getElementById('jobsAutoContent');
  const listEl = document.getElementById('jobsFullList');
  const countEl = document.getElementById('jobsCount');

  if (!AppState.candidateProfile || !AppState.resumeText) {
    needResume.style.display = 'block'; autoContent.style.display = 'none'; return;
  }
  needResume.style.display = 'none'; autoContent.style.display = 'block';

  const p = AppState.candidateProfile;
  document.getElementById('jobsProfileRole2').textContent = p.role;
  document.getElementById('jobsProfileSkills2').textContent = p.skills.slice(0, 6).join(', ');

  let jobs = [];
  if (AppState.analysisResult && AppState.analysisResult.recommendedJobs && AppState.analysisResult.recommendedJobs.length > 0) {
    jobs = AppState.analysisResult.recommendedJobs.map((j, i) => ({ ...j, id: 990 + i, match: j.match || 98 }));
  }

  if (!jobs.length) {
    countEl.innerHTML = '<strong>0</strong> vagas retornadas pela IA para este perfil';
    listEl.innerHTML = '<div class="jobs-empty">A IA nao retornou vagas nesta analise. Refaça a analise para gerar novas vagas.</div>';
    showToast('Nenhuma vaga retornada pela IA nesta analise.', 'warning');
    return;
  }

  countEl.innerHTML = `<strong>${jobs.length}</strong> vagas perfeitas geradas pela IA para o seu perfil`;

  // Generate cover letters (somente IA)
  showToast('Gerando cartas de apresentação...', 'info');

  for (let i = 0; i < jobs.length; i++) {
    const job = jobs[i];
    if (!AppState.jobCoverLetters[job.id]) {
      const prompt = `Escreva uma carta de apresentação curta (150 palavras) em português para "${job.title}" na "${job.company}". Candidato: ${p.name}, ${p.role} ${p.level}, skills: ${p.skills.join(', ')}. Vaga pede: ${job.tags.join(', ')}. Seja direto e profissional.`;
      const ai = await callGemini(prompt);
      AppState.jobCoverLetters[job.id] = ai || (AppState.aiLastUserError || 'Carta nao gerada pela IA nesta tentativa.');
    }
  }

  const profileSkills = p.skills.map(s => s.toLowerCase());

  listEl.innerHTML = jobs.map((job, i) => {
    const mc = job.match >= 75 ? 'high' : job.match >= 50 ? 'medium' : 'low';
    const applied = AppState.applications.some(a => a.jobId === job.id);
    const letter = AppState.jobCoverLetters[job.id] || '';

    return `
    <div class="job-full-card" style="animation-delay:${i * .08}s">
      <div class="job-full-top">
        <div style="display:flex;gap:16px;align-items:center">
          <div class="job-company-logo" style="background:${job.logoBg}">${job.logo}</div>
          <div>
            <div class="job-full-title">${job.title}</div>
            <div class="job-full-company">${job.company}</div>
          </div>
        </div>
        <div style="display:flex;align-items:center;gap:12px">
          <span class="job-full-source">via ${job.source}</span>
          <div class="job-match">
            <div class="job-match-circle ${mc}">${job.match}%</div>
            <span class="job-match-label">match</span>
          </div>
        </div>
      </div>

      <div class="job-full-body">
        <div class="job-full-meta">
          <span>📍 ${job.location}</span>
          <span>💰 ${job.salary}</span>
          <span>🕒 ${job.posted}</span>
        </div>
        <div class="job-full-tags">
          ${job.tags.map(t => {
            const isMatch = profileSkills.includes(t.toLowerCase());
            return `<span class="job-tag${isMatch ? ' match' : ''}">${t}${isMatch ? ' ✓' : ''}</span>`;
          }).join('')}
        </div>
        <div class="job-full-desc">${job.description}</div>
      </div>

      <!-- Carta de Apresentação -->
      <div class="job-full-letter">
        <div class="job-full-letter-title">💌 Carta de Apresentação (gerada automaticamente)</div>
        <div class="job-full-letter-text" id="letter-${job.id}">${escHtml(letter)}</div>
      </div>

      ${applied
        ? `<div class="job-full-applied">✅ Candidatura enviada em ${AppState.applications.find(a=>a.jobId===job.id)?.date}</div>`
        : `<div class="job-full-actions">
            <a href="${job.url}" target="_blank" class="job-full-link">🔗 Ver Vaga em ${job.source}</a>
            <button class="btn btn-secondary btn-sm" onclick="copyLetter(${job.id})">📋 Copiar Carta</button>
            <button class="btn btn-primary btn-sm" onclick="applyToJob(${job.id})">🚀 Candidatar-se</button>
          </div>`
      }
    </div>`;
  }).join('');

  showToast(`${jobs.length} vagas encontradas com cartas prontas! 🎉`, 'success');
}

function copyLetter(jobId) {
  const text = AppState.jobCoverLetters[jobId] || '';
  navigator.clipboard.writeText(text).then(() => showToast('Carta copiada! 📋', 'success')).catch(() => showToast('Erro ao copiar.', 'error'));
}

function applyToJob(jobId) {
  let job = JOBS_DB.find(j => j.id === jobId);
  if (!job && AppState.analysisResult && AppState.analysisResult.recommendedJobs) {
    job = AppState.analysisResult.recommendedJobs.map((j, i) => ({...j, id: 990 + i})).find(j => j.id === jobId);
  }
  if (!job || AppState.applications.some(a => a.jobId === jobId)) return;
  AppState.applications.push({
    jobId: job.id, title: job.title, company: job.company,
    logo: job.logo || '🏢', logoBg: job.logoBg || '#000000',
    date: new Date().toLocaleDateString('pt-BR'),
    status: ['sent','sent','viewed'][Math.floor(Math.random() * 3)],
  });
  showToast(`Candidatura enviada para ${job.company}! 🚀`, 'success');
  renderJobs();
}

// ===== DASHBOARD =====
function renderDashboard() {
  const apps = AppState.applications;
  const matched = AppState.analysisResult?.recommendedJobs?.length || 0;
  document.getElementById('statJobs').textContent = matched;
  document.getElementById('statApplied').textContent = apps.length;
  document.getElementById('statViewed').textContent = apps.filter(a => a.status === 'viewed').length;
  document.getElementById('statResponses').textContent = apps.filter(a => a.status === 'interview').length;
  document.querySelectorAll('.stat-value').forEach(el => animNum(el, 0, parseInt(el.textContent), 800));

  const listEl = document.getElementById('applicationsList'), emptyEl = document.getElementById('applicationsEmpty');
  if (!apps.length) { listEl.innerHTML = ''; emptyEl.style.display = 'block'; return; }
  emptyEl.style.display = 'none';
  const labels = { sent:'Enviada', viewed:'Visualizada', interview:'Entrevista', rejected:'Recusada' };
  listEl.innerHTML = apps.map(a => `
    <div class="application-row">
      <div class="application-company-icon" style="background:${a.logoBg}">${a.logo}</div>
      <div class="application-info"><div class="application-title">${a.title}</div><div class="application-company-name">${a.company}</div></div>
      <div class="application-date">${a.date}</div>
      <span class="application-status ${a.status}">${labels[a.status]}</span>
    </div>`).join('');
}

// ===== UTILS =====
function showToast(msg, type = 'info') {
  const c = document.getElementById('toastContainer'), icons = { success:'✅', error:'❌', info:'ℹ️' };
  const t = document.createElement('div'); t.className = `toast ${type}`; t.innerHTML = `<span>${icons[type]||'ℹ️'}</span><span>${msg}</span>`;
  c.appendChild(t); setTimeout(() => t.remove(), 4000);
}
function escHtml(t) { const d = document.createElement('div'); d.textContent = t; return d.innerHTML; }
function clamp(v, min, max) { return Math.max(min, Math.min(max, v)); }
function shuffle(a) { return [...a].sort(() => Math.random() - .5); }

// ===== LOGIN =====
function checkLogin() {
  // Alterado para sessionStorage para obrigar a ver o Login ao abrir nova aba/janela
  if (sessionStorage.getItem('sr_osvaldo_session')) {
    document.getElementById('loginGate').classList.add('hidden');
  } else {
    document.getElementById('loginGate').classList.remove('hidden');
  }
}

// ===== COACH CHAT =====
async function sendCoachMessage() {
  const input = document.getElementById('coachInput');
  const msg = input.value.trim();
  if (!msg) return;

  const chatBody = document.getElementById('coachChatBody');
  
  // Render user message
  const userDiv = document.createElement('div');
  userDiv.className = 'chat-msg user';
  userDiv.innerHTML = `<div class="chat-bubble">${escHtml(msg)}</div><div class="chat-time">Agora</div>`;
  chatBody.appendChild(userDiv);
  
  input.value = '';
  chatBody.scrollTop = chatBody.scrollHeight;
  const btn = document.getElementById('coachSendBtn');
  btn.disabled = true;

  // Render typing indicator
  const typingDiv = document.createElement('div');
  typingDiv.className = 'chat-msg bot';
  typingDiv.id = 'coachTyping';
  typingDiv.innerHTML = `<div class="chat-bubble"><div class="typing-indicator"><div class="typing-dot"></div><div class="typing-dot"></div><div class="typing-dot"></div></div></div>`;
  chatBody.appendChild(typingDiv);
  chatBody.scrollTop = chatBody.scrollHeight;

  // Prepare Gemini Prompt
  let coachPrompt = `Você é o "Coach OSvaldo", um assistente de carreira amigável e especialista em RH dentro do app "Sr. OSvaldo".
Você deve responder diretamente ao usuário. Suas respostas devem ser curtas e diretas ao ponto (máximo 2 parágrafos).
Se o usuário tiver um currículo analisado, considere o seguinte perfil para dar respostas personalizadas:
Nome: ${AppState.candidateProfile?.name || 'Não informado'}
Cargo: ${AppState.candidateProfile?.role || 'Não informado'}
Nível: ${AppState.candidateProfile?.level || 'Não informado'}
Skills: ${(AppState.candidateProfile?.skills || []).join(', ')}

Pergunta do usuário: "${msg}"`;

  let responseText = "Desculpe, a IA está desligada. Configure sua API Key no topo para eu acordar!";
  
  if (AppState.aiServiceReady) {
    const rawR = await callGemini(coachPrompt);
    if (!rawR) {
      responseText = AppState.aiLastUserError || 'Ops, nao obtive resposta da IA.';
    } else if (rawR.startsWith('[ERRO]')) {
      responseText = AppState.aiLastUserError || `Tive um problema de conexão com a IA. Detalhe: ${rawR}`;
    } else {
      responseText = rawR;
    }
  }

  // Remove typing
  document.getElementById('coachTyping')?.remove();

  // Render bot reply
  const botDiv = document.createElement('div');
  botDiv.className = 'chat-msg bot';
  /* Formatação básica de markdown para HTML */
  let formattedResponse = escHtml(responseText).replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>').replace(/\n/g, '<br>');
  botDiv.innerHTML = `<div class="chat-bubble">${formattedResponse}</div><div class="chat-time">Agora</div>`;
  chatBody.appendChild(botDiv);
  
  chatBody.scrollTop = chatBody.scrollHeight;
  btn.disabled = false;
  input.focus();
}

// ===== INIT =====
document.addEventListener('DOMContentLoaded', () => {
  window.handleLogin = handleLogin;
  window.openSignupModal = openSignupModal;
  window.closeSignupModal = closeSignupModal;
  window.handlePasswordRecovery = handlePasswordRecovery;

  checkLogin();
  initDropzone();
  updateApiStatus();
  initGoogleIdentity();
  restoreAndValidateSavedApiKey();
  window.addEventListener('scroll', () => document.getElementById('navbar').classList.toggle('scrolled', window.scrollY > 20));
  console.log('🎩 Sr. OSvaldo v4.0 — Login & Coach Added');
});
