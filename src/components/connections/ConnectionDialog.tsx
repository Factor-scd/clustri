import { useEffect, useState } from 'react'
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
import { ShieldAlert, Loader2 } from 'lucide-react'
import { useConnectionStore } from '@/stores/connectionStore'
import { useToast } from '@/components/ui/toast'
import {
  loginWithPassword,
  loginWithToken,
  addConnection,
  updateConnection,
  setActiveConnection as setActiveConnectionIPC,
  connectToServer,
  getCertificateInfo,
  trustCertificate,
  isTauri,
} from '@/lib/tauri'
import type {
  ConnectionConfig,
  AuthMode,
  CertificateInfo,
  LoginResult,
} from '@/types/connection'

interface ConnectionDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  /** When set, the dialog edits this connection instead of creating a new one. */
  editing?: ConnectionConfig
}

type DialogStep = 'credentials' | 'certificate' | 'connecting'

export function ConnectionDialog({ open, onOpenChange, editing }: ConnectionDialogProps) {
  const addConnectionToStore = useConnectionStore((s) => s.addConnection)
  const removeConnectionFromStore = useConnectionStore((s) => s.removeConnection)
  const setAuthStatus = useConnectionStore((s) => s.setAuthStatus)
  const setActiveConnection = useConnectionStore((s) => s.setActiveConnection)
  const setConnectionStatus = useConnectionStore((s) => s.setConnectionStatus)
  const { addToast } = useToast()

  const [step, setStep] = useState<DialogStep>('credentials')
  const [authMode, setAuthMode] = useState<AuthMode>('password')
  const [name, setName] = useState('')
  const [url, setUrl] = useState('')
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [apiToken, setApiToken] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [certificate, setCertificate] = useState<CertificateInfo | null>(null)
  const [pendingResult, setPendingResult] = useState<LoginResult | null>(null)

  const resetForm = () => {
    setStep('credentials')
    setName('')
    setUrl('')
    setUsername('')
    setPassword('')
    setApiToken('')
    setError(null)
    setCertificate(null)
    setPendingResult(null)
    setIsLoading(false)
  }

  // Prefill the form when the dialog opens in edit mode. The URL is immutable
  // (changing servers is a remove + re-add), so it is populated read-only.
  useEffect(() => {
    if (open && editing) {
      setStep('credentials')
      setName(editing.name)
      setUrl(editing.primary.url)
      setUsername(editing.username ?? '')
      setAuthMode(editing.authMode)
      setPassword('')
      setApiToken('')
      setError(null)
      setCertificate(null)
      setPendingResult(null)
      setIsLoading(false)
    }
  }, [open, editing])

  const loadCertificate = async (cleanUrl: string) => {
    setIsLoading(true)
    setError(null)
    try {
      const info = await getCertificateInfo(cleanUrl)
      setCertificate(info)
    } catch (err) {
      setCertificate(null)
      setError(err instanceof Error ? err.message : 'Failed to fetch certificate')
    } finally {
      setIsLoading(false)
    }
  }

  const handleOpenChange = (nextOpen: boolean) => {
    if (!nextOpen) resetForm()
    onOpenChange(nextOpen)
  }

  const handleEditSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!editing) return
    setIsLoading(true)
    setError(null)

    try {
      const cleanUrl = editing.primary.url.replace(/\/$/, '')

      // Re-validate credentials only when a new password/token was entered;
      // this also refreshes the stored keyring credentials for the connection.
      if (authMode === 'password') {
        if (!username) {
          throw new Error('Username is required')
        }
        if (password) {
          await loginWithPassword(cleanUrl, username, password)
        }
      } else if (apiToken) {
        await loginWithToken(cleanUrl, apiToken)
      }

      const config: ConnectionConfig = {
        id: editing.id,
        name: name || editing.name,
        primary: {
          url: cleanUrl,
          token: authMode === 'token' ? apiToken || editing.primary.token : undefined,
        },
        fallbacks: editing.fallbacks,
        certFingerprint: editing.certFingerprint,
        trusted: editing.trusted,
        acceptUntrusted: editing.acceptUntrusted,
        status: editing.status,
        isCluster: editing.isCluster,
        authMode,
        username: authMode === 'password' ? username : undefined,
        nodes: editing.nodes,
        clusterId: editing.clusterId,
      }

      await updateConnection(config)
      useConnectionStore.getState().updateConnection(config.id, config)
      addToast(`Connection "${config.name}" updated`, 'success')

      resetForm()
      onOpenChange(false)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update connection')
    } finally {
      setIsLoading(false)
    }
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (editing) {
      await handleEditSubmit(e)
      return
    }
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

      if (!isTauri()) {
        // Browser mock mode: keep the single-step flow
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
        return
      }

      // Tauri mode: review the server certificate before trusting it
      setPendingResult(result)
      setStep('certificate')
      await loadCertificate(cleanUrl)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to connect')
    } finally {
      setIsLoading(false)
    }
  }

  const handleTrustAndConnect = async () => {
    if (!certificate || !pendingResult) return

    const connectionId = pendingResult.connectionId || crypto.randomUUID()
    const cleanUrl = url.replace(/\/$/, '')
    const connectionName = name || (authMode === 'password' ? username : 'API Token Connection')

    setStep('connecting')
    setError(null)

    try {
      const config: ConnectionConfig = {
        id: connectionId,
        name: connectionName,
        primary: {
          url: cleanUrl,
          token: authMode === 'token' ? apiToken : undefined,
        },
        fallbacks: [],
        certFingerprint: certificate.fingerprint,
        trusted: true,
        acceptUntrusted: false,
        status: 'connecting',
        isCluster: false,
        authMode,
        username: authMode === 'password' ? username : undefined,
      }

      // The backend requires the connection to exist before pinning its
      // certificate, so register it first, then trust, then connect.
      await addConnection(config)
      await trustCertificate(connectionId, certificate.fingerprint)
      await setActiveConnectionIPC(connectionId)

      addConnectionToStore(config)
      setActiveConnection(connectionId)
      setConnectionStatus(connectionId, 'connecting')
      setAuthStatus('authenticated')

      const result = await connectToServer(connectionId)

      if (result.status === 'failed') {
        setConnectionStatus(connectionId, 'failed')
        addToast('Could not reach any cluster node', 'error')
        resetForm()
        onOpenChange(false)
        return
      }

      if (result.mergedInto && result.mergedInto !== connectionId) {
        // The backend folded this connection into an existing same-cluster
        // connection; mirror the merge in the store.
        removeConnectionFromStore(connectionId)
        setActiveConnection(result.mergedInto)
        setConnectionStatus(result.mergedInto, result.status)
        setAuthStatus('authenticated')
        addToast('Connected to existing cluster — added as a failover endpoint.', 'success')
        resetForm()
        onOpenChange(false)
        return
      }

      setConnectionStatus(connectionId, 'connected')

      addToast(`Connected to ${connectionName}`, 'success')
      resetForm()
      onOpenChange(false)
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to connect'
      setConnectionStatus(connectionId, 'failed')
      addToast(message, 'error')
      resetForm()
      onOpenChange(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent>
        {step === 'credentials' && (
          <>
            <DialogHeader>
              <DialogTitle>{editing ? 'Edit Connection' : 'Connect to Proxmox'}</DialogTitle>
              <DialogDescription>
                {editing
                  ? 'Update this connection. The server URL cannot be changed; add a new connection to target a different server.'
                  : 'Sign in with your Proxmox credentials or API token'}
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
                    readOnly={!!editing}
                    disabled={!!editing}
                  />
                  <p className="text-xs text-muted-foreground">
                    {editing
                      ? 'Server URL cannot be changed while editing'
                      : 'The URL of your Proxmox server (must use HTTPS)'}
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
                      placeholder={editing ? 'Leave blank to keep current password' : 'Your password'}
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      required={!editing}
                    />
                  </div>
                </TabsContent>

                <TabsContent value="token" className="space-y-4 mt-0">
                  <div className="space-y-2">
                    <Label htmlFor="token">API Token</Label>
                    <Input
                      id="token"
                      type="password"
                      placeholder={editing ? 'Leave blank to keep current token' : 'user@realm!tokenid=secret'}
                      value={apiToken}
                      onChange={(e) => setApiToken(e.target.value)}
                      required={!editing}
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
                  <Button type="button" variant="outline" onClick={() => handleOpenChange(false)}>
                    Cancel
                  </Button>
                  <Button type="submit" disabled={isLoading}>
                    {isLoading
                      ? (editing ? 'Saving...' : 'Connecting...')
                      : (editing ? 'Save Changes' : 'Connect')}
                  </Button>
                </DialogFooter>
              </form>
            </Tabs>
          </>
        )}

        {step === 'certificate' && (
          <>
            <DialogHeader>
              <DialogTitle>Verify Server Certificate</DialogTitle>
              <DialogDescription>
                Review the certificate presented by {url}
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-4">
              {isLoading && (
                <div className="flex items-center justify-center gap-2 py-6 text-muted-foreground">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  <span className="text-sm">Fetching certificate...</span>
                </div>
              )}

              {!isLoading && certificate && (
                <>
                  <div className="flex items-start gap-2 rounded-md bg-destructive/10 border border-destructive/20 p-3">
                    <ShieldAlert className="h-5 w-5 text-destructive shrink-0 mt-0.5" />
                    <p className="text-sm text-destructive">
                      This is a self-signed or untrusted certificate. Verify the fingerprint
                      against your Proxmox server&apos;s SSL certificate before trusting.
                    </p>
                  </div>

                  <div className="space-y-3 rounded-md border border-border/70 bg-muted/20 p-4">
                    <div className="grid grid-cols-2 gap-x-3 gap-y-4 text-sm">
                      <div>
                        <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Subject</p>
                        <p className="mt-1 break-all font-mono text-xs">{certificate.subject || '-'}</p>
                      </div>
                      <div>
                        <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Issuer</p>
                        <p className="mt-1 break-all font-mono text-xs">{certificate.issuer || '-'}</p>
                      </div>
                      <div>
                        <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Valid From</p>
                        <p className="mt-1 font-mono text-xs tabular-nums">{certificate.validFrom || '-'}</p>
                      </div>
                      <div>
                        <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Valid To</p>
                        <p className="mt-1 font-mono text-xs tabular-nums">{certificate.validTo || '-'}</p>
                      </div>
                      <div>
                        <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Self-signed</p>
                        <p className="mt-1 font-medium">
                          {certificate.selfSigned ? 'Yes' : 'No'}
                        </p>
                      </div>
                    </div>
                    <div>
                      <p className="mb-1 text-xs font-medium uppercase tracking-wide text-muted-foreground">Fingerprint (SHA-256)</p>
                      <code className="block rounded-md border border-border/70 bg-muted/50 px-3 py-2 font-mono text-xs break-all">
                        {certificate.fingerprint}
                      </code>
                    </div>
                  </div>
                </>
              )}

              {!isLoading && !certificate && error && (
                <div className="p-3 bg-destructive/10 border border-destructive/20 rounded-md">
                  <p className="text-sm text-destructive">{error}</p>
                </div>
              )}

              <DialogFooter>
                <Button type="button" variant="outline" onClick={() => handleOpenChange(false)}>
                  Cancel
                </Button>
                {certificate ? (
                  <Button type="button" onClick={handleTrustAndConnect} disabled={isLoading}>
                    Trust and Connect
                  </Button>
                ) : (
                  <Button
                    type="button"
                    onClick={() => loadCertificate(url.replace(/\/$/, ''))}
                    disabled={isLoading}
                  >
                    {isLoading ? 'Retrying...' : 'Retry'}
                  </Button>
                )}
              </DialogFooter>
            </div>
          </>
        )}

        {step === 'connecting' && (
          <>
            <DialogHeader>
              <DialogTitle>Connecting</DialogTitle>
              <DialogDescription>
                Establishing a connection to {url}
              </DialogDescription>
            </DialogHeader>

            <div className="flex items-center justify-center gap-2 py-8 text-muted-foreground">
              <Loader2 className="h-5 w-5 animate-spin" />
              <span className="text-sm">Trusting certificate and connecting...</span>
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  )
}
