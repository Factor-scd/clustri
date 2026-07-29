import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { ThemeSwitcher } from '@/components/settings/ThemeSwitcher'
import { ConnectionManager } from '@/components/settings/ConnectionManager'
import { ExternalLink } from 'lucide-react'

export function SettingsPage() {
  return (
    <div className="h-full overflow-y-auto">
      <div className="max-w-2xl mx-auto p-6 space-y-6">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Settings</h1>
          <p className="text-muted-foreground text-sm mt-1">
            Manage your application preferences
          </p>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Appearance</CardTitle>
            <CardDescription>
              Customize the look and feel of the application
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              <label className="text-sm font-medium">Theme</label>
              <ThemeSwitcher />
              <p className="text-xs text-muted-foreground">
                Select your preferred color scheme. System will match your OS setting.
              </p>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Connections</CardTitle>
            <CardDescription>
              Manage your Proxmox server connections
            </CardDescription>
          </CardHeader>
          <CardContent>
            <ConnectionManager />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>About</CardTitle>
            <CardDescription>Application information</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-sm text-muted-foreground">Version</span>
                <span className="text-sm font-medium">0.1.0</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sm text-muted-foreground">Platform</span>
                <span className="text-sm font-medium">Tauri + React</span>
              </div>
              <div className="pt-2 border-t">
                <a
                  href="https://github.com/proxmoxdesktop"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1.5 text-sm text-primary hover:underline"
                >
                  View on GitHub
                  <ExternalLink className="h-3.5 w-3.5" />
                </a>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
