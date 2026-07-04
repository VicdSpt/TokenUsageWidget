import { useState } from 'react'
import type { AppConfig } from '../hooks/useStats'

interface SettingsProps {
  config: AppConfig
  onSave(p: Partial<AppConfig>): Promise<void>
  onClose(): void
  onReset(): Promise<void>
}

export default function Settings({ config, onSave, onClose, onReset }: SettingsProps) {
  const [form, setForm] = useState<AppConfig>({ ...config })
  const [saving, setSaving] = useState(false)
  const [confirmReset, setConfirmReset] = useState(false)
  const [resetting, setResetting] = useState(false)

  const set = <K extends keyof AppConfig>(k: K, v: AppConfig[K]) =>
    setForm(f => ({ ...f, [k]: v }))

  const handleSave = async () => {
    setSaving(true)
    await onSave(form)
    setSaving(false)
    onClose()
  }

  return (
    <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50" onClick={onClose}>
      <div
        className="bg-[#161b22] border border-[#30363d] rounded-xl p-5 w-72 shadow-2xl"
        onClick={e => e.stopPropagation()}
      >
        <div className="flex justify-between items-center mb-4">
          <h2 className="text-[#e6edf3] font-semibold text-sm">Param&egrave;tres</h2>
          <button onClick={onClose} className="text-[#8b949e] hover:text-white text-lg leading-none">&#x2715;</button>
        </div>

        <div className="space-y-3 text-sm">
          <label className="block">
            <span className="text-[#8b949e] text-xs">Chemin ~/.claude</span>
            <input
              className="mt-1 w-full bg-[#0d1117] border border-[#30363d] rounded px-2 py-1.5 text-[#e6edf3] outline-none focus:border-[#00cc6a] text-xs"
              value={form.claudePath}
              onChange={e => set('claudePath', e.target.value)}
            />
          </label>

          <label className="block">
            <span className="text-[#8b949e] text-xs">Cl&eacute; API Anthropic (optionnel)</span>
            <input
              type="password"
              className="mt-1 w-full bg-[#0d1117] border border-[#30363d] rounded px-2 py-1.5 text-[#e6edf3] outline-none focus:border-[#00cc6a] text-xs"
              value={form.apiKey}
              onChange={e => set('apiKey', e.target.value)}
              placeholder="sk-ant-..."
            />
          </label>

          <label className="block">
            <span className="text-[#8b949e] text-xs">Plan Claude</span>
            <select
              className="mt-1 w-full bg-[#0d1117] border border-[#30363d] rounded px-2 py-1.5 text-[#e6edf3] outline-none text-xs"
              value={form.plan}
              onChange={e => set('plan', e.target.value as 'pro' | 'max')}
            >
              <option value="pro">Pro</option>
              <option value="max">Max</option>
            </select>
          </label>

          <label className="block">
            <span className="text-[#8b949e] text-xs">Intervalle de refresh</span>
            <select
              className="mt-1 w-full bg-[#0d1117] border border-[#30363d] rounded px-2 py-1.5 text-[#e6edf3] outline-none text-xs"
              value={form.refreshIntervalMin}
              onChange={e => set('refreshIntervalMin', Number(e.target.value))}
            >
              <option value={5}>5 min</option>
              <option value={15}>15 min</option>
              <option value={30}>30 min</option>
            </select>
          </label>

          <div className="flex items-center justify-between">
            <span className="text-[#8b949e] text-xs">Lancer au d&eacute;marrage</span>
            <button
              onClick={() => set('launchAtLogin', !form.launchAtLogin)}
              className={`relative w-9 h-5 rounded-full transition-colors ${form.launchAtLogin ? 'bg-[#00cc6a]' : 'bg-[#30363d]'}`}
            >
              <span className={`absolute top-0.5 left-0.5 w-4 h-4 bg-white rounded-full transition-transform ${form.launchAtLogin ? 'translate-x-4' : ''}`} />
            </button>
          </div>

          <label className="block">
            <div className="flex justify-between">
              <span className="text-[#8b949e] text-xs">Taille du texte</span>
              <span className="text-[#e6edf3] text-xs">{form.fontSize}px</span>
            </div>
            <input
              type="range"
              min={11}
              max={18}
              value={form.fontSize}
              onChange={e => set('fontSize', Number(e.target.value))}
              className="w-full mt-1 accent-[#00cc6a]"
            />
          </label>
        </div>

        <div className="border-t border-[#30363d] pt-3 mt-3">
          {!confirmReset ? (
            <button
              onClick={() => setConfirmReset(true)}
              className="w-full py-1.5 text-xs border border-[#30363d] text-[#ff7b72] rounded hover:bg-[#0d1117] hover:border-[#ff7b72]"
            >
              R&eacute;initialiser la synchronisation
            </button>
          ) : (
            <div className="space-y-2">
              <p className="text-[#ff7b72] text-xs text-center">Effacer toutes les donn&eacute;es ?</p>
              <div className="flex gap-2">
                <button onClick={() => setConfirmReset(false)} className="flex-1 py-1 text-xs border border-[#30363d] text-[#8b949e] rounded hover:bg-[#0d1117]">
                  Non
                </button>
                <button
                  disabled={resetting}
                  onClick={async () => {
                    setResetting(true)
                    await onReset()
                    setResetting(false)
                    setConfirmReset(false)
                    onClose()
                  }}
                  className="flex-1 py-1 text-xs bg-[#ff7b72] text-black font-bold rounded hover:opacity-90 disabled:opacity-50"
                >
                  {resetting ? '...' : 'Oui, effacer'}
                </button>
              </div>
            </div>
          )}
        </div>

        <div className="flex gap-2 mt-3">
          <button onClick={onClose} className="flex-1 py-1.5 text-xs border border-[#30363d] text-[#8b949e] rounded hover:bg-[#0d1117]">
            Annuler
          </button>
          <button
            onClick={handleSave}
            disabled={saving}
            className="flex-1 py-1.5 text-xs bg-[#00cc6a] text-black font-bold rounded hover:opacity-90 disabled:opacity-50"
          >
            {saving ? '...' : 'Enregistrer'}
          </button>
        </div>
      </div>
    </div>
  )
}
