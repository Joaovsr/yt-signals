<div align="center">

# YT Signals

### Transforme comentários do YouTube em decisões claras.

O YT Signals lê a conversa da audiência, identifica temas e sentimentos com IA e organiza tudo em um mapa visual interativo — sem planilhas, amostragens manuais ou horas navegando pela seção de comentários.

![React](https://img.shields.io/badge/React-19-61DAFB?logo=react&logoColor=white)
![Node.js](https://img.shields.io/badge/Node.js-20+-5FA04E?logo=nodedotjs&logoColor=white)
![OpenAI](https://img.shields.io/badge/OpenAI-Responses_API-412991?logo=openai&logoColor=white)
![YouTube](https://img.shields.io/badge/YouTube-Data_API-FF0000?logo=youtube&logoColor=white)

</div>

## Veja o YT Signals em ação

<p align="center">
  <a href="docs/screenshots/yt-signals-map.png">
    <img src="docs/screenshots/yt-signals-map.png" alt="Mapa interativo do YT Signals mostrando temas, comentários, sentimento e resumo de um vídeo" width="100%">
  </a>
</p>

<p align="center"><sub>Uma análise completa transforma comentários dispersos em temas conectados, sentimento e evidências exploráveis.</sub></p>

<!--
Screenshots opcionais para complementar a apresentação:

![Detalhes de um tema e seus comentários](docs/screenshots/theme-details.png)
![Histórico de análises](docs/screenshots/analysis-history.png)
-->

## Entenda sua audiência de verdade

Cole o link de um vídeo e receba uma leitura estruturada dos comentários mais relevantes. O YT Signals transforma uma conversa dispersa em sinais fáceis de explorar:

- temas que mais mobilizam a audiência;
- sentimento positivo, neutro e negativo;
- comentários que sustentam cada conclusão;
- palavras-chave e oportunidades recorrentes;
- resumo executivo e principais aprendizados;
- histórico local para revisitar análises anteriores.

Cada comentário analisado aparece em apenas um tema principal. Isso mantém as contagens coerentes e permite sair do resumo agregado para a evidência original com um clique.

## Uma interface feita para exploração

O mapa representa visualmente a conversa do público. Temas mais relevantes ganham destaque, enquanto os comentários permanecem conectados ao contexto que lhes deu significado.

Você pode navegar, ampliar, arrastar e selecionar os nós para descobrir rapidamente o que as pessoas elogiam, questionam, criticam ou querem ver a seguir.

## Como funciona

```text
Link do vídeo
     ↓
YouTube Data API ── metadados + comentários públicos
     ↓
OpenAI Responses API ── temas + sentimento + aprendizados
     ↓
Validação e reconstrução segura dos comentários
     ↓
Mapa interativo + histórico local
```

Frontend e backend fazem parte da mesma aplicação e usam um único `package.json`:

- no desenvolvimento, Vite serve a interface e a API na porta `5173`;
- em produção, Node serve o build e a API na porta configurada, por padrão `8080`;
- as chaves do YouTube e da OpenAI permanecem exclusivamente no servidor;
- respostas externas são validadas antes de chegar ao grafo.

## Tecnologias

- React 19 e TypeScript;
- Node.js com servidor HTTP nativo;
- Vite;
- YouTube Data API v3;
- OpenAI Responses API com Structured Outputs;
- Zod para validação de contratos;
- React Force Graph para a visualização;
- Vitest e Testing Library.

## Execute localmente

### Pré-requisitos

- Node.js 20 ou superior;
- uma chave da YouTube Data API v3;
- uma chave da OpenAI API.

### 1. Instale as dependências

```bash
npm install
```

### 2. Configure o ambiente

```bash
cp .env.example .env
```

Preencha pelo menos estas duas variáveis:

```dotenv
YOUTUBE_API_KEY=your_youtube_data_api_key
OPENAI_API_KEY=your_openai_api_key
```

Configurações disponíveis:

| Variável | Padrão | Descrição |
| --- | --- | --- |
| `HTTP_ADDRESS` | `127.0.0.1:8080` | Endereço usado pelo servidor de produção |
| `YOUTUBE_API_KEY` | — | Chave da YouTube Data API v3 |
| `OPENAI_API_KEY` | — | Chave da OpenAI API |
| `OPENAI_MODEL` | `gpt-5.6-luna` | Modelo usado para analisar os comentários |
| `OPENAI_REASONING_EFFORT` | `low` | Esforço de raciocínio enviado ao modelo |
| `OPENAI_TIMEOUT` | `2m30s` | Limite de tempo de cada chamada à OpenAI |
| `DEBUG_PAYLOAD_LOGS` | `false` | Exibe payloads completos para depuração local |

Não ative `DEBUG_PAYLOAD_LOGS` em produção: os logs podem conter nomes e textos públicos dos comentários analisados.

### 3. Inicie o desenvolvimento

```bash
npm run dev
```

Acesse [http://127.0.0.1:5173](http://127.0.0.1:5173). Frontend e backend estarão disponíveis nessa mesma porta.

## Execute em produção

```bash
npm run build
npm start
```

A aplicação será disponibilizada em [http://127.0.0.1:8080](http://127.0.0.1:8080), salvo quando `HTTP_ADDRESS`, `HTTP_HOST` ou `PORT` definirem outro endereço.

O processo Node serve simultaneamente:

- o frontend compilado em `dist`;
- `GET /health`;
- `POST /api/v1/videos/{videoId}/comment-analysis`.

## Testes e qualidade

```bash
npm run check
npm run build
```

A suíte cobre frontend, cliente do YouTube, análise da OpenAI, validações de domínio, endpoint HTTP e o pipeline completo com serviços externos falsos. Os testes automatizados não consomem as chaves do `.env`.

## Extensão para Chrome — primeira versão local

O código da extensão e seu servidor Node ficam neste projeto. Não é necessário Go. O painel mostra resumo da **descrição do vídeo e dos comentários**, sentimentos da amostra, temas e principais sinais. A análise completa abre em outra aba da própria extensão, usando o resultado já salvo.

1. Configure o `.env` conforme as instruções acima, execute `npm run build` e mantenha `npm start` em um terminal. O servidor local usa `http://127.0.0.1:8080` por padrão.
2. Em outro terminal, execute `npm run build:extension`.
3. Abra `chrome://extensions`, ative o modo de desenvolvedor e use **Carregar sem compactação** para selecionar a pasta `dist-extension` deste projeto.
4. Recarregue o YouTube e clique em **Ver insights** no card de um vídeo da página inicial ou dos resultados de busca. O painel abre sem navegar para o vídeo. O botão também aparece em grades de vídeos de canais e próximo às ações de um vídeo já aberto.
5. Mantenha o painel aberto durante a análise. Depois, use **Abrir análise completa** para explorar o grafo.

Para usar a API integrada do Vite durante o desenvolvimento, mantenha `npm run dev` aberto e compile o pacote com:

```bash
VITE_API_BASE_URL=http://127.0.0.1:5173 npm run build:extension
```

A URL da API é uma configuração pública do build; nunca coloque chaves em variáveis `VITE_*`. O manifest limita as permissões de rede ao YouTube e ao host configurado. Para voltar ao servidor de produção local, compile novamente sem essa variável. Ao alterar código ou configuração, recompile e recarregue a extensão em `chrome://extensions`.

O site continua funcionando com `npm run dev` ou `npm start`. Deixe `VITE_API_BASE_URL` ausente no ambiente do site para usar a API da mesma origem.

### Comportamento e limites da extensão

- Chrome desktop 116 ou superior; outros navegadores ainda precisam de validação.
- Botão nos cards de vídeos da página inicial, busca e grades de canais, além das páginas `/watch`. Shorts, `/live/`, anúncios, playlists/mixes e mobile não fazem parte do primeiro corte.
- O painel usa o ID do card selecionado, mesmo quando a aba continua na home ou na busca. Ao mudar a URL da aba, uma seleção de outra página não é reutilizada silenciosamente.
- Navegar entre vídeos não dispara novas análises. Abrir os insights exige ação do usuário; resultados salvos são reutilizados, e **Atualizar análise** solicita uma nova análise.
- Histórico local de até seis vídeos em `chrome.storage.local`, compartilhado entre painel e analytics e acessível apenas às páginas da extensão. O histórico antigo do site não é importado nem apagado automaticamente.
- Ao fechar ou descarregar o painel, a análise pode ser interrompida. Uma nova tentativa deve ser solicitada; não há processamento persistente com a extensão fechada.
- Se a descrição estiver vazia, o modelo recebe essa informação e deve limitar o resumo aos comentários. Sentimentos, temas, contagens e evidências continuam baseados nos comentários.
- Uma falha ao salvar mantém o resultado visível e permite tentar salvar novamente sem outra chamada de análise.
- O pacote local não inclui autenticação ou publicação em loja. Antes de disponibilizar uma API pública, concluir controle de acesso, limites de uso, hospedagem HTTPS e documentação de privacidade.

As verificações automatizadas cobrem navegação simulada, seleção de cards sem abrir vídeos, isolamento de vídeo, persistência concorrente, rejeição de mensagens inválidas e abertura do resultado salvo. O botão foi inspecionado e clicado no Google Chrome real em resultados de busca e na grade pública de um canal. Também foi validado o fluxo com a extensão instalada: o clique abriu o painel, disparou uma única requisição para uma API local simulada e apresentou o resultado. Essas verificações não executaram análises pagas. A home do perfil de inspeção não tinha recomendações personalizadas; seu comportamento é coberto pelos testes com a estrutura dos cards da grade.

## Limites atuais

- um vídeo por análise;
- até 100 comentários relevantes por mapa;
- somente comentários públicos de nível principal;
- uma análise pode levar alguns minutos, dependendo do vídeo e do modelo.
