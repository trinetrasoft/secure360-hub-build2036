import React, { useState, useEffect } from 'react';
import Sidebar from './components/Sidebar';
import Header from './components/Header';
import LoginPage from './pages/LoginPage';
import ExecutiveDashboard from './pages/ExecutiveDashboard';
import OperationsDashboard from './pages/OperationsDashboard';
import StorageDashboard from './pages/StorageDashboard';
import BackupRecovery from './pages/BackupRecovery';
import SecurityDashboard from './pages/SecurityDashboard';
import IncidentCommand from './pages/IncidentCommand';
import IntegrationsPage from './pages/IntegrationsPage';
import ArchitecturePage from './pages/ArchitecturePage';
import AIInsights from './pages/AIInsights';
import { ReportsPage, AutomationPage, SettingsPage } from './pages/ReportsAutomationSettings';
import { C } from './theme/colors';
import { getHealth, readPrincipal, subjectFor, writePrincipal } from './services/secure360Api';

const AUTH_KEY = 'teye_session';

function readSession() {
  try {
    return sessionStorage.getItem(AUTH_KEY) === '1';
  } catch {
    return false;
  }
}

function persistSession(remember) {
  try {
    if (remember) {
      sessionStorage.setItem(AUTH_KEY, '1');
    } else {
      sessionStorage.removeItem(AUTH_KEY);
    }
  } catch {
    /* ignore */
  }
}

/**
 * Root application shell.
 *
 * Layout: dark slate sidebar (left) anchors the SPA, light off-white canvas
 * holds the active module. Active view is route-like state (no router needed
 * for this prototype; replace with react-router when wiring real APIs).
 *
 * Security, governance, and AI security command centre.
 */
export default function App() {
  const [authenticated, setAuthenticated] = useState(readSession);
  const [active, setActive] = useState('executive');
  const [env, setEnv] = useState('All Environments');
  const [time, setTime] = useState(() => new Date().toUTCString().slice(17, 25));
  const [principal, setPrincipal] = useState(readPrincipal);
  const [executionMode, setExecutionMode] = useState('mock');

  useEffect(() => {
    const t = setInterval(
      () => setTime(new Date().toUTCString().slice(17, 25)),
      1000
    );
    return () => clearInterval(t);
  }, []);

  useEffect(() => {
    let cancelled = false;
    getHealth()
      .then((health) => {
        if (!cancelled) setExecutionMode(health.execution_mode || 'mock');
      })
      .catch(() => {
        if (!cancelled) setExecutionMode('mock');
      });
    return () => {
      cancelled = true;
    };
  }, [principal.tenantId, principal.role]);

  const handlePrincipalChange = (next) => {
    const updated = {
      ...next,
      subject: subjectFor(next.role),
    };
    writePrincipal(updated);
    setPrincipal(updated);
  };

  const handleLogin = ({ remember }) => {
    persistSession(remember);
    setAuthenticated(true);
  };

  const handleSignOut = () => {
    try {
      sessionStorage.removeItem(AUTH_KEY);
    } catch {
      /* ignore */
    }
    setAuthenticated(false);
  };

  if (!authenticated) {
    return <LoginPage onLogin={handleLogin} />;
  }

  return (
    <div
      className="font-display h-screen flex flex-col overflow-hidden"
      style={{ background: C.bg, color: C.ink }}
    >
      <div className="flex flex-1 overflow-hidden">
        <Sidebar active={active} onNav={setActive} />
        <div className="flex-1 flex flex-col overflow-hidden" style={{ background: C.bgAlt }}>
          <Header
            env={env}
            onEnvChange={setEnv}
            liveTime={time}
            onSignOut={handleSignOut}
            activePage={active}
            onNavigate={setActive}
            principal={principal}
            onPrincipalChange={handlePrincipalChange}
            executionMode={executionMode}
          />
          <main className="flex-1 overflow-y-auto scrollbar-thin p-5 md:p-6">
            <div className="slide-in" key={active}>
              {active === 'executive'    && <ExecutiveDashboard env={env} />}
              {active === 'operations'   && <OperationsDashboard env={env} />}
              {active === 'storage'      && <StorageDashboard env={env} />}
              {active === 'backup'       && <BackupRecovery env={env} />}
              {active === 'security'     && <SecurityDashboard env={env} />}
              {active === 'incidents'    && (
                <IncidentCommand
                  env={env}
                  principal={principal}
                  executionMode={executionMode}
                />
              )}
              {active === 'integrations' && <IntegrationsPage env={env} />}
              {active === 'architecture' && <ArchitecturePage env={env} />}
              {active === 'ai'           && <AIInsights env={env} />}
              {active === 'reports'      && <ReportsPage />}
              {active === 'automation'   && <AutomationPage />}
              {active === 'settings'     && <SettingsPage />}
            </div>
            <div
              className="text-center text-[10px] font-mono-num mt-8 pb-2"
              style={{ color: C.inkMute }}
            >
              Secure360 Hub v2.4.1 · build 8af2c91 · © 2026
            </div>
          </main>
        </div>
      </div>
    </div>
  );
}
