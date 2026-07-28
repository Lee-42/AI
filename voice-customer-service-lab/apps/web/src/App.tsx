import { publicConfig } from "./config";

export function App() {
  return (
    <main className="shell">
      <section className="card" aria-labelledby="page-title">
        <p className="eyebrow">VOICE CUSTOMER SERVICE LAB</p>
        <h1 id="page-title">AI 实时语音客服</h1>
        <p>Monorepo、配置和契约边界已就绪。</p>
        <dl>
          <div>
            <dt>API</dt>
            <dd>{publicConfig.apiBaseUrl}</dd>
          </div>
          <div>
            <dt>Provider</dt>
            <dd>Mock（第 05 节接入）</dd>
          </div>
        </dl>
      </section>
    </main>
  );
}
