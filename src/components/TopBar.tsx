import React from 'react';
import { PanelRight, Wifi, WifiOff } from 'lucide-react';

export type ActiveNavSection = 'chat' | 'sign_camera' | 'robot' | 'firmware';

interface TopBarProps {
  activeSection: ActiveNavSection;
  onSelectSection: (section: ActiveNavSection) => void;
  mqttState: 'disconnected' | 'connecting' | 'connected' | 'error';
  onOpenMqttConfig: () => void;
  showSidebarToggle?: boolean;
  sidebarOpen?: boolean;
  onToggleSidebar?: () => void;
}

export const TopBar: React.FC<TopBarProps> = ({
  activeSection,
  onSelectSection,
  mqttState,
  onOpenMqttConfig,
  showSidebarToggle = false,
  sidebarOpen = true,
  onToggleSidebar,
}) => {
  const navItems: Array<{ id: ActiveNavSection; label: string }> = [
    { id: 'chat', label: 'المحادثة' },
    { id: 'sign_camera', label: 'كاميرا الإشارة' },
    { id: 'robot', label: 'أوامر الروبوت' },
    { id: 'firmware', label: 'كود ESP32' },
  ];

  const isConnected = mqttState === 'connected';

  return (
    <header className="w-full h-14 px-4 sm:px-6 border-b border-white/8 bg-[#131416] flex items-center justify-between gap-4 sm:gap-8 shrink-0">
      {/* Zone 1: Sidebar toggle + Single text element wordmark */}
      <div className="flex items-center gap-2.5 shrink-0">
        {showSidebarToggle && onToggleSidebar && (
          <button
            type="button"
            onClick={onToggleSidebar}
            aria-label={sidebarOpen ? 'إخفاء قائمة المحادثات' : 'إظهار قائمة المحادثات'}
            aria-expanded={sidebarOpen}
            className="p-2 rounded-lg text-stone-400 hover:text-stone-100 hover:bg-white/6 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-500"
          >
            <PanelRight className="w-4 h-4" aria-hidden="true" />
          </button>
        )}
        <a
          href="#top"
          onClick={(e) => {
            e.preventDefault();
            onSelectSection('chat');
          }}
          className="font-display text-lg font-bold tracking-tight text-stone-100 whitespace-nowrap shrink-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-500 rounded"
        >
          JisrBot
        </a>
      </div>

      {/* Zone 2: 4 concise single-line text navigation links */}
      <nav aria-label="التنقل الرئيسي" className="hidden md:flex items-center gap-6">
        {navItems.map((item) => {
          const isActive = activeSection === item.id;
          return (
            <button
              key={item.id}
              type="button"
              onClick={() => onSelectSection(item.id)}
              className={`relative py-2 text-sm font-semibold transition-colors whitespace-nowrap shrink-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-500 rounded ${
                isActive ? 'text-amber-400' : 'text-stone-400 hover:text-stone-100'
              }`}
            >
              {item.label}
              {isActive && (
                <span
                  aria-hidden="true"
                  className="absolute inset-x-0 -bottom-[11px] h-[2px] bg-amber-400"
                />
              )}
            </button>
          );
        })}
      </nav>

      {/* Zone 3: 1 primary action */}
      <div className="flex items-center shrink-0">
        <button
          type="button"
          onClick={onOpenMqttConfig}
          aria-label="إعداد اتصال ESP32 عبر MQTT"
          className="inline-flex items-center gap-2 px-3.5 py-1.5 text-sm font-semibold rounded-lg bg-amber-500 text-stone-950 hover:bg-amber-400 transition-colors whitespace-nowrap shrink-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-300"
        >
          {isConnected ? (
            <Wifi className="w-4 h-4 shrink-0" aria-hidden="true" />
          ) : (
            <WifiOff className="w-4 h-4 shrink-0" aria-hidden="true" />
          )}
          <span>ربط ESP32</span>
        </button>
      </div>
    </header>
  );
};
