# Sr. OSvaldo

Agente inteligente de carreira focado em automação do processo de candidatura:

- Upload e leitura de currículo (PDF/TXT/DOC/DOCX)
- Análise com IA (Google Gemini) em múltiplas dimensões
- Geração de melhorias para currículo
- Geração de PDF de saída com recomendações
- Match automático de vagas
- Carta de apresentação pronta por vaga
- Coach de carreira em chat
- Dashboard de candidaturas

## Visão Geral

O projeto é um aplicativo web estático (HTML + CSS + JavaScript), sem backend próprio.
Toda a execução acontece no navegador do usuário.

A IA e servida por um endpoint seguro no backend/proxy.
O navegador nao recebe nem armazena chave de API.

## Funcionalidades Principais

### 1. Login Gate

- Tela inicial de login (UI)
- Sessão controlada por `sessionStorage` (`sr_osvaldo_session`)
- Usuário salvo em `localStorage` (`sr_osvaldo_user`)

### 2. Upload e Extração de Currículo

- Arrastar/soltar ou seleção de arquivo
- Suporte a `.pdf`, `.txt`, `.doc`, `.docx`
- Extração de texto de PDF via `pdf.js`
- Campo opcional para URL do LinkedIn

### 3. Análise com IA (5 agentes visuais)

O app exibe um fluxo visual de agentes enquanto processa:

- Formatação
- Experiência
- Formação
- Habilidades
- Vagas

Na prática, o processamento central ocorre por prompt no Gemini, retornando JSON estruturado com:

- Score geral
- Scores por categoria
- Pontos fortes e fracos
- Melhorias sugeridas
- Perfil do candidato
- Vagas recomendadas

Arquitetura de chamada:

- Frontend chama endpoint seguro (`/api/gemini`)
- Backend/proxy chama Gemini com segredo em variável de ambiente

### 4. Otimização de Currículo

- Usa melhorias retornadas pela IA
- Se a IA não retornar melhorias, o app solicita nova tentativa
- Exibe resumo de alterações por tipo:
  - added
  - modified
  - removed

### 5. Geração de PDF

- Usa `pdf-lib` para gerar PDF com recomendações e resumo do perfil
- Faz download no navegador

### 6. Vagas e Cartas

- Usa vagas recomendadas pela IA
- Calcula e exibe compatibilidade retornada pela IA
- Gera cartas de apresentação via IA

### 7. Coach de Carreira

- Chat com contexto do perfil extraído
- Respostas curtas orientadas a carreira
- Também usa Gemini quando chave está configurada

### 8. Dashboard

- Indicadores de vagas compatíveis e candidaturas
- Lista de candidaturas com status

## Stack e Bibliotecas

- HTML5
- CSS3
- JavaScript (Vanilla)
- [pdf.js](https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js)
- [jsPDF](https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js)
- [html2canvas](https://cdnjs.cloudflare.com/ajax/libs/html2canvas/1.4.1/html2canvas.min.js)
- [pdf-lib](https://unpkg.com/pdf-lib@1.17.1/dist/pdf-lib.min.js)

IA:

- Google Gemini (modelo compativel detectado automaticamente)

Proxy/Backend sugerido para IA:

- Cloudflare Worker (pasta `cloudflare/`)

## Estrutura do Projeto

```text
SrOsvaldo/
  cloudflare/
    worker.js
    wrangler.toml
  deploy_github.bat
  index.html
  README.md
  css/
    style.css
  js/
    app.js
  img/
    logo.png
```

## Como Executar Localmente

Por ser um projeto estático, você pode:

1. Abrir `index.html` diretamente no navegador, ou
2. Servir com um servidor local (recomendado)

Exemplo com VS Code Live Server:

- Clique com botão direito em `index.html`
- Selecione "Open with Live Server"

## Configuração da IA (Gemini)

1. Publique o Worker em `cloudflare/worker.js`
2. Configure o segredo do Worker:
  - `wrangler secret put GEMINI_API_KEY`
3. (Opcional) restrinja origem em `cloudflare/wrangler.toml`:
  - `ALLOWED_ORIGIN = "https://carloscostato-cmyk.github.io"`
4. O app ja vem com endpoint padrao do Worker configurado
5. Se necessario, abra o modal `IA` apenas para sobrescrever a URL e testar conexao

## Login Google

O botão "Continuar com Google" agora usa o fluxo oficial do Google Identity Services e valida a credencial no Worker.

Passos de configuração:

1. Garanta que o `Client ID` OAuth esteja configurado no front-end e no Worker
2. No Worker, defina `GOOGLE_CLIENT_ID` como secret
3. Mantenha `GOOGLE_CLIENT_ID` igual ao client do OAuth criado no Google Cloud
4. Se o `Client Secret` foi exibido em captura de tela, trate como exposto e gere outro no Google Cloud

Observação:

- O app não usa `Client Secret` no navegador
- A validação do login acontece no Worker por meio do token `id_token`
- O login é liberado somente depois da validação do token pelo backend

## Conta com Senha

O app também suporta criação de conta com e-mail e senha para quem não quiser usar Google.

Fluxo:

1. Clique em `Criar Conta`
2. Informe nome, e-mail e senha
3. O Worker grava o usuário em `USERS_KV` com hash PBKDF2
4. Depois disso, o login usa e-mail + senha no botão `Entrar`

Configuração necessária no Worker:

- `USERS_KV` para armazenar os usuários
- `GOOGLE_CLIENT_ID` para manter o login Google funcionando

Observação:

- A senha não fica em texto puro no navegador
- O cadastro e a validação acontecem no Worker

### Fase 2 - Segurança no Worker

- Rate limit por IP (opcional)
- Quota diaria por IP (opcional)
- Limite maximo de tamanho de prompt
- Suporte opcional a CAPTCHA (Cloudflare Turnstile)
- Logs estruturados anonimizados (hash de IP)
- CORS por origem permitida

Observacao:

- Rate limit e quota diaria estao desativados por padrao na implementacao atual.
- Para ativar, configure `RATE_LIMIT_WINDOW_SECONDS`, `RATE_LIMIT_MAX_REQUESTS` e `DAILY_QUOTA_PER_IP` no Worker.

Configuracao em `cloudflare/wrangler.toml`:

- `RATE_LIMIT_WINDOW_SECONDS`
- `RATE_LIMIT_MAX_REQUESTS`
- `DAILY_QUOTA_PER_IP`
- `MAX_PROMPT_CHARS`
- `REQUIRE_TURNSTILE`
- `TURNSTILE_SECRET`
- `LOG_SALT`
- `ALLOWED_ORIGIN`

### Fase 3 - UX sem fricção

- Usuario final nao precisa inserir chave de IA no navegador
- Modal `IA` mostra apenas status de conexao do servico
- Mensagens amigaveis para bloqueio de seguranca (captcha) e indisponibilidade do endpoint
- Fluxos de analise, otimizacao, vagas e coach mostram feedback claro ao usuario

### Deploy rápido do Worker (Cloudflare)

1. Instale o Wrangler: `npm i -g wrangler`
2. Login: `wrangler login`
3. Entre na pasta `cloudflare/`
4. Configure o segredo: `wrangler secret put GEMINI_API_KEY`
5. (Opcional) Configure `GOOGLE_CLIENT_ID` para login Google: `wrangler secret put GOOGLE_CLIENT_ID`
6. Publique: `wrangler deploy`

### Checklist Operacional

Use este fluxo para validar a instalação de ponta a ponta:

1. Abra a URL do Worker publicada e teste `GET /api/health`
2. Confirme que o retorno traz `ok: true` e um modelo válido
3. Abra o Sr. OSvaldo no navegador
4. Verifique se o status de IA aparece como ativo
5. (Opcional) Clique em `IA` para sobrescrever endpoint e testar conexao
6. Faça upload de um currículo e rode a análise completa
7. Confirme se vagas, cartas e coach respondem sem pedir chave no navegador

## Deploy e Publicação

Script incluso:

- `deploy_github.bat`

Ele executa:

- `git add .`
- `git commit -m "Atualizacao automatica: data/hora"`
- `git push origin main`

## Limitações Atuais

- Não há backend para persistência centralizada
- Dados de sessão/candidaturas ficam no navegador da máquina do usuário
- Dependência de endpoint de IA publicado e ativo
- Qualidade de recomendação depende da qualidade do texto extraído do currículo

## Roadmap Sugerido

- Backend opcional para salvar histórico do usuário
- Integração real com APIs de vagas
- Login social real (OAuth)
- Persistência de candidaturas em banco
- Testes automatizados e validações de qualidade de prompts
- Dashboard operacional de uso e limite da IA

## Autor

Desenvolvido e projetado por Carlos Costato.
