import { useState } from 'react'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { useConnectionStore } from '@/stores/connectionStore'
import { loginWithPassword, loginWithToken, addConnection } from '@/lib/tauri'
import type { ConnectionConfig, AuthMode } from '@/types/connection'

interface ConnectionDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
}

export function ConnectionDialog({ open, onOpenChange }: ConnectionDialogProps) {
  const addConnectionToStore = useConnectionStore((s) => s.addConnection)
  const setAuthStatus = useConnectionStore((s) => s.setAuthStatus)
  const setActiveConnection = useConnectionStore((s) => s.setActiveConnection)

  const [authMode, setAuthMode] = useState<AuthMode>('password')
  const [name, setName] = useState('')
  const [url, setUrl] = useState('')
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [apiToken, setApiToken] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const resetForm = () => {
    setName('')
    setUrl('')
    setUsername('')
    setPassword('')
    setApiToken('')
    setError(null)
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setIsLoading(true)
    setError(null)

    try {
      if (!url.startsWith('https://')) {
        throw new Error('URL must start with https://')
      }

      const cleanUrl = url.replace(/\/$/, '')

      let result
      if (authMode === 'password') {
        if (!username || !password) {
          throw new Error('Username and password are required')
        }
        result = await loginWithPassword(cleanUrl, username, password)
      } else {
        if (!apiToken) {
          throw new Error('API token is required')
        }
        result = await loginWithToken(cleanUrl, apiToken)
      }

      const connectionId = result.connectionId || crypto.randomUUID()

      const config: ConnectionConfig = {
        id: connectionId,
        name: name || (authMode === 'password' ? username : 'API Token Connection'),
        primary: {
          url: cleanUrl,
          token: authMode === 'token' ? apiToken : undefined,
        },
        fallbacks: [],
        trusted: false,
        status: 'connected',
        isCluster: false,
        authMode,
        username: authMode === 'password' ? username : undefined,
      }

      await addConnection(config)
      addConnectionToStore(config)
      setActiveConnection(connectionId)
      setAuthStatus('authenticated')

      resetForm()
      onOpenChange(false)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to connect')
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Connect to Proxmox</DialogTitle>
          <DialogDescription>
            Sign in with your Proxmox credentials or API token
          </DialogDescription>
        </DialogHeader>

        <Tabs value={authMode} onValueChange={(v) => { setAuthMode(v as AuthMode); setError(null) }}>
          <TabsList className="w-full">
            <TabsTrigger value="password" className="flex-1">Username & Password</TabsTrigger>
            <TabsTrigger value="token" className="flex-1">API Token</TabsTrigger>
          </TabsList>

          <form onSubmit={handleSubmit} className="space-y-4 mt-4">
            <div className="space-y-2">
              <Label htmlFor="url">Server URL</Label>
              <Input
                id="url"
                placeholder="https://192.168.1.10:8006"
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                required
              />
              <p className="text-xs text-muted-foreground">
                The URL of your Proxmox server (must use HTTPS)
              </p>
            </div>

            <TabsContent value="password" className="space-y-4 mt-0">
              <div className="space-y-2">
                <Label htmlFor="username">Username</Label>
                <Input
                  id="username"
                  placeholder="root@pam"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  required
                />
                <p className="text-xs text-muted-foreground">
                  Format: user@realm (e.g. root@pam)
                </p>
              </div>
              <div className="space-y-2">
                <Label htmlFor="password">Password</Label>
                <Input
                  id="password"
                  type="password"
                  placeholder="Your password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                />
              </div>
            </TabsContent>

            <TabsContent value="token" className="space-y-4 mt-0">
              <div className="space-y-2">
                <Label htmlFor="token">API Token</Label>
                <Input
                  id="token"
                  type="password"
                  placeholder="user@realm!tokenid=secret"
                  value={apiToken}
                  onChange={(e) => setApiToken(e.target.value)}
                  required
                />
                <p className="text-xs text-muted-foreground">
                  Format: user@realm!tokenid=secret
                </p>
              </div>
            </TabsContent>

            <div className="space-y-2">
              <Label htmlFor="name">Connection Name (optional)</Label>
              <Input
                id="name"
                placeholder="Home Lab"
                value={name}
                onChange={(e) => setName(e.target.value)}
              />
            </div>

            {error && (
              <div className="p-3 bg-destructive/10 border border-destructive/20 rounded-md">
                <p className="text-sm text-destructive">{error}</p>
              </div>
            )}

            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
                Cancel
              </Button>
              <Button type="submit" disabled={isLoading}>
                {isLoading ? 'Connecting...' : 'Connect'}
              </Button>
            </DialogFooter>
          </form>
        </Tabs>
      </DialogContent>
    </Dialog>
  )
}
