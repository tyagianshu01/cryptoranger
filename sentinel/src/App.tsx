import React from 'react';
import { useStore } from './store/useStore';
import { Sidebar } from './components/layout/Sidebar';
import { TopHeader } from './components/layout/TopHeader';
import { BottomTicker } from './components/layout/BottomTicker';
import { GraphExplorer } from './pages/GraphExplorer';
import { CypherConsole } from './pages/CypherConsole';
import { LinkedTransactionsPage } from './pages/LinkedTransactionsPage';
import { HomePage } from './pages/HomePage';
import { SupportTerminal } from './components/panels/SupportTerminal';

const PAGES: Record<string, React.ReactNode> = {
  'homepage': <HomePage />,
  'graph-explorer': <GraphExplorer />,
  'linked-transactions': <LinkedTransactionsPage />,
  'cypher-console': <CypherConsole />
};

export default function App() {
  const activePage = useStore((s) => s.activePage);
  const sidebarOpen = useStore((s) => s.sidebarOpen);

  return (
    <div
      style={{
        display: 'grid',
        gridTemplateColumns: sidebarOpen ? 'var(--spacing-sidebar) minmax(0, 1fr)' : '0px minmax(0, 1fr)',
        gridTemplateRows: 'auto 1fr auto',
        height: '100vh',
        overflow: 'hidden',
        background: 'var(--color-base)',
        transition: 'grid-template-columns 0.2s ease',
      }}
    >
      {/* Sidebar — spans all rows */}
      <div style={{
        gridRow: '1 / 4',
        gridColumn: '1',
        borderRight: '1px solid var(--color-border)',
        display: 'flex',
        flexDirection: 'column',
        overflow: 'hidden',
        opacity: sidebarOpen ? 1 : 0,
        visibility: sidebarOpen ? 'visible' : 'hidden',
        transition: 'opacity 0.2s ease, visibility 0.2s ease'
      }}>
        <Sidebar />
      </div>

      {/* Top header */}
      <div style={{ gridRow: '1', gridColumn: '2', borderBottom: '1px solid var(--color-border)', zIndex: 10, overflow: 'hidden', minWidth: 0 }}>
        <TopHeader />
      </div>

      {/* Main content */}
      <div style={{ gridRow: '2', gridColumn: '2', overflowY: 'auto', display: 'flex', flexDirection: 'column', minWidth: 0 }}>
        {PAGES[activePage] ?? <HomePage />}
      </div>

      {/* Bottom ticker */}
      <div style={{ gridRow: '3', gridColumn: '2', borderTop: '1px solid var(--color-border)', overflow: 'hidden', minWidth: 0 }}>
        <BottomTicker />
      </div>

      {/* Global AI Chat Support Widget */}
      <SupportTerminal />
    </div>
  );
}