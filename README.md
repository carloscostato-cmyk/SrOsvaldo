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

A IA é habilitada via chave de API do Google Gemini informada no modal do app.
Quando a chave não está disponível, o sistema usa fallbacks locais para manter o fluxo funcionando.

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

### 4. Otimização de Currículo

- Usa melhorias retornadas pela IA
- Se necessário, aplica fallback local heurístico
- Exibe resumo de alterações por tipo:
  - added
  - modified
  - removed

### 5. Geração de PDF

- Usa `pdf-lib` para gerar PDF com recomendações e resumo do perfil
- Faz download no navegador

### 6. Vagas e Cartas

- Usa vagas recomendadas pela IA (quando disponíveis)
- Senão, usa base local (`JOBS_DB`)
- Calcula match por skills e contexto do currículo
- Gera cartas (Gemini para topo da lista, fallback local para restante)

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

- Google Gemini (`gemini-1.5-flash`)

## Estrutura do Projeto

```text
SrOsvaldo/
  deploy_github.bat
  index.html
  README.md
  curriculo_candidato_otimizado.pdf
  css/
    style.css
  js/
    app.js
  img/
    ...
```

## Como Executar Localmente

Por ser um projeto estático, você pode:

1. Abrir `index.html` diretamente no navegador, ou
2. Servir com um servidor local (recomendado)

Exemplo com VS Code Live Server:

- Clique com botão direito em `index.html`
- Selecione "Open with Live Server"

## Configuração da IA (Gemini)

1. Acesse: https://aistudio.google.com/apikey
2. Gere sua chave
3. No app, clique em "IA" e cole a chave
4. A chave é salva no navegador em `localStorage` (`sr_osvaldo_gemini_key`)

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
- Dependência de API Key manual para IA real
- Qualidade de recomendação depende da qualidade do texto extraído do currículo

## Roadmap Sugerido

- Backend opcional para salvar histórico do usuário
- Integração real com APIs de vagas
- Login social real (OAuth)
- Persistência de candidaturas em banco
- Testes automatizados e validações de qualidade de prompts

## Autor

Desenvolvido e projetado por Carlos Costato.
