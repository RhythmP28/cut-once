import { useEffect, useState } from "react";
import { describeError, fetchPageImage } from "../api";

const MAX_PAGES = 40;

/** Pages 1, 2, 3… of one document, stopping at the first 404. Images are fetched with the bearer token. */
function DocumentPages({ documentId }: { documentId: string }) {
  const [pages, setPages] = useState<string[]>([]);
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const ctrl = new AbortController();
    const urls: string[] = [];
    setPages([]);
    setDone(false);
    setError(null);
    (async () => {
      for (let n = 1; n <= MAX_PAGES; n++) {
        const url = await fetchPageImage(documentId, n, ctrl.signal);
        if (ctrl.signal.aborted) {
          if (url) URL.revokeObjectURL(url);
          return;
        }
        if (!url) break;
        urls.push(url);
        setPages([...urls]);
      }
      setDone(true);
    })().catch((e) => {
      if (ctrl.signal.aborted) return;
      setError(describeError(e));
      setDone(true);
    });
    return () => {
      ctrl.abort();
      for (const u of urls) URL.revokeObjectURL(u);
    };
  }, [documentId]);

  return (
    <div className="doc-pages">
      <h3 className="mono">{documentId}</h3>
      {pages.map((url, i) => (
        <a key={url} href={url} target="_blank" rel="noreferrer" className="page-thumb" title="Open full size">
          <img src={url} alt={`${documentId} page ${i + 1}`} loading="lazy" />
          <span className="muted small">page {i + 1}</span>
        </a>
      ))}
      {!done && <p className="muted small">Loading pages…</p>}
      {done && pages.length === 0 && !error && <p className="muted small">No page images for this document.</p>}
      {error && <p className="amber small">Stopped after page {pages.length}: {error}</p>}
    </div>
  );
}

export function PagePreview({ documentIds }: { documentIds: string[] }) {
  if (documentIds.length === 0) return <p className="muted">This plan lists no source documents.</p>;
  return (
    <div className="page-preview">
      {documentIds.map((id) => <DocumentPages key={id} documentId={id} />)}
    </div>
  );
}
