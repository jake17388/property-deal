import { useAppVersion } from '../hooks/useAppVersion.js';

const LABEL  = { fontSize: 14, color: '#6b7280' };
const VALUE  = { fontSize: 14, fontWeight: 700, color: '#111827' };
const ROW    = {
  display: 'flex', alignItems: 'center', justifyContent: 'space-between',
  padding: '14px 0', borderBottom: '1px solid #f3f4f6',
};

function checkLabel(status, updateAvailable) {
  if (status === 'checking') return 'Checking…';
  if (status === 'error')    return 'Could not check — try again';
  if (status === 'current')  return updateAvailable ? 'Update available' : "You're up to date";
  return 'Check for Updates';
}

export default function Settings({ onClose }) {
  const { version, build, updateAvailable, status, check, reload } = useAppVersion();
  const busy = status === 'checking';

  return (
    <div
      onClick={onClose}
      style={{
        position: 'fixed', inset: 0, zIndex: 100,
        background: 'rgba(17,24,39,0.45)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        padding: 24,
        fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
      }}
    >
      <div
        onClick={e => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label="Settings"
        style={{
          background: '#fff', borderRadius: 20, width: '100%', maxWidth: 380,
          padding: '24px 24px 20px', boxShadow: '0 4px 24px rgba(0,0,0,0.18)',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
          <h2 style={{ fontSize: 20, fontWeight: 800, color: '#111827' }}>Settings</h2>
          <button
            onClick={onClose}
            aria-label="Close settings"
            style={{
              background: 'none', border: 'none', color: '#9ca3af',
              fontSize: 20, cursor: 'pointer', padding: 4, lineHeight: 1,
            }}
          >
            ✕
          </button>
        </div>

        {updateAvailable && (
          <div style={{
            display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10,
            background: '#eff6ff', border: '1px solid #bfdbfe', borderRadius: 12,
            padding: '12px 14px', marginBottom: 8,
          }}>
            <span style={{ fontSize: 13, color: '#1e40af', fontWeight: 600 }}>
              🔄 New version available
            </span>
            <button
              onClick={reload}
              style={{
                background: '#1d4ed8', color: '#fff', border: 'none',
                borderRadius: 10, padding: '8px 14px',
                fontSize: 13, fontWeight: 700, cursor: 'pointer', whiteSpace: 'nowrap',
              }}
            >
              Update now
            </button>
          </div>
        )}

        <div style={ROW}>
          <span style={LABEL}>Version</span>
          <span style={VALUE}>{version ?? '—'}</span>
        </div>
        <div style={{ ...ROW, borderBottom: 'none' }}>
          <span style={LABEL}>Build</span>
          <span style={{ ...VALUE, fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace', fontWeight: 600, color: '#6b7280' }}>
            {build ?? '—'}
          </span>
        </div>

        <button
          onClick={check}
          disabled={busy}
          style={{
            width: '100%', marginTop: 12,
            background: busy ? '#d1d5db' : '#15803d', color: '#fff',
            border: 'none', borderRadius: 14, padding: '16px',
            fontSize: 16, fontWeight: 700,
            cursor: busy ? 'default' : 'pointer',
          }}
        >
          {checkLabel(status, updateAvailable)}
        </button>
      </div>
    </div>
  );
}
