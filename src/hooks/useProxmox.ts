import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import * as api from '@/lib/tauri'
import { useConnectionStore } from '@/stores/connectionStore'
import { useToast } from '@/components/ui/toast'
import type { AddDiskConfig, AddNICConfig, EditNICConfig, CreateSnapshotConfig, BackupJobConfig, RestoreConfig } from '@/types/proxmox'

// Query keys
export const queryKeys = {
  nodes: (connectionId: string) => ['nodes', connectionId],
  vms: (connectionId: string) => ['vms', connectionId],
  storage: (connectionId: string) => ['storage', connectionId],
  storageContent: (connectionId: string, storage: string) => ['storageContent', connectionId, storage],
  storageDetail: (connectionId: string, node: string, storage: string) => ['storageDetail', connectionId, node, storage],
  tasks: (connectionId: string) => ['tasks', connectionId],
  cluster: (connectionId: string) => ['cluster', connectionId],
  disks: (connectionId: string, node: string, vmid: number) => ['disks', connectionId, node, vmid],
  networks: (connectionId: string, node: string, vmid: number) => ['networks', connectionId, node, vmid],
  snapshots: (connectionId: string, node: string, vmid: number) => ['snapshots', connectionId, node, vmid],
  vncProxy: (connectionId: string, node: string, vmid: number) => ['vncProxy', connectionId, node, vmid],
  termProxy: (connectionId: string, node: string, vmid: number) => ['termProxy', connectionId, node, vmid],
  backupJobs: (connectionId: string) => ['backupJobs', connectionId],
  backups: (connectionId: string, storage?: string) => ['backups', connectionId, storage],
}

// Hooks for fetching data
export const useNodes = (connectionId: string | null) => {
  return useQuery({
    queryKey: queryKeys.nodes(connectionId!),
    queryFn: () => api.getNodes(connectionId!),
    enabled: !!connectionId,
    refetchInterval: 10000, // 10 seconds
  })
}

export const useVMs = (connectionId: string | null) => {
  return useQuery({
    queryKey: queryKeys.vms(connectionId!),
    queryFn: () => api.getVMs(connectionId!),
    enabled: !!connectionId,
    refetchInterval: 15000, // 15 seconds
  })
}

export const useStorage = (connectionId: string | null) => {
  return useQuery({
    queryKey: queryKeys.storage(connectionId!),
    queryFn: () => api.getStorage(connectionId!),
    enabled: !!connectionId,
    refetchInterval: 30000, // 30 seconds
  })
}

export const useStorageContent = (connectionId: string | null, storage: string | null) => {
  return useQuery({
    queryKey: queryKeys.storageContent(connectionId!, storage!),
    queryFn: () => api.getStorageContent(connectionId!, storage!),
    enabled: !!connectionId && !!storage,
    refetchInterval: 30000,
  })
}

export const useStorageDetail = (connectionId: string | null, node: string | null, storage: string | null) => {
  return useQuery({
    queryKey: queryKeys.storageDetail(connectionId!, node!, storage!),
    queryFn: () => api.getStorageDetail(connectionId!, node!, storage!),
    enabled: !!connectionId && !!node && !!storage,
    refetchInterval: 30000,
  })
}

export const useTasks = (connectionId: string | null) => {
  return useQuery({
    queryKey: queryKeys.tasks(connectionId!),
    queryFn: () => api.getTasks(connectionId!),
    enabled: !!connectionId,
    refetchInterval: 30000, // 30 seconds
  })
}

export const useClusterStatus = (connectionId: string | null) => {
  return useQuery({
    queryKey: queryKeys.cluster(connectionId!),
    queryFn: () => api.getClusterStatus(connectionId!),
    enabled: !!connectionId,
    refetchInterval: 30000, // 30 seconds
  })
}

// Mutations for VM lifecycle
export const useStartVM = () => {
  const queryClient = useQueryClient()
  const { addToast } = useToast()

  return useMutation({
    mutationFn: ({ node, vmid }: { node: string; vmid: number }) => {
      const connId = useConnectionStore.getState().activeConnectionId!
      return api.startVM(connId, node, vmid)
    },
    onSuccess: () => {
      const connId = useConnectionStore.getState().activeConnectionId
      if (connId) {
        queryClient.invalidateQueries({ queryKey: queryKeys.vms(connId) })
      }
    },
    onError: (error: Error) => {
      addToast(error.message || 'Failed to start VM', 'error')
    },
  })
}

export const useStopVM = () => {
  const queryClient = useQueryClient()
  const { addToast } = useToast()

  return useMutation({
    mutationFn: ({ node, vmid }: { node: string; vmid: number }) => {
      const connId = useConnectionStore.getState().activeConnectionId!
      return api.stopVM(connId, node, vmid)
    },
    onSuccess: () => {
      const connId = useConnectionStore.getState().activeConnectionId
      if (connId) {
        queryClient.invalidateQueries({ queryKey: queryKeys.vms(connId) })
      }
    },
    onError: (error: Error) => {
      addToast(error.message || 'Failed to stop VM', 'error')
    },
  })
}

export const useShutdownVM = () => {
  const queryClient = useQueryClient()
  const { addToast } = useToast()

  return useMutation({
    mutationFn: ({ node, vmid }: { node: string; vmid: number }) => {
      const connId = useConnectionStore.getState().activeConnectionId!
      return api.shutdownVM(connId, node, vmid)
    },
    onSuccess: () => {
      const connId = useConnectionStore.getState().activeConnectionId
      if (connId) {
        queryClient.invalidateQueries({ queryKey: queryKeys.vms(connId) })
      }
    },
    onError: (error: Error) => {
      addToast(error.message || 'Failed to shutdown VM', 'error')
    },
  })
}

export const useRebootVM = () => {
  const queryClient = useQueryClient()
  const { addToast } = useToast()

  return useMutation({
    mutationFn: ({ node, vmid }: { node: string; vmid: number }) => {
      const connId = useConnectionStore.getState().activeConnectionId!
      return api.rebootVM(connId, node, vmid)
    },
    onSuccess: () => {
      const connId = useConnectionStore.getState().activeConnectionId
      if (connId) {
        queryClient.invalidateQueries({ queryKey: queryKeys.vms(connId) })
      }
    },
    onError: (error: Error) => {
      addToast(error.message || 'Failed to reboot VM', 'error')
    },
  })
}

export const useSuspendVM = () => {
  const queryClient = useQueryClient()
  const { addToast } = useToast()

  return useMutation({
    mutationFn: ({ node, vmid }: { node: string; vmid: number }) => {
      const connId = useConnectionStore.getState().activeConnectionId!
      return api.suspendVM(connId, node, vmid)
    },
    onSuccess: () => {
      const connId = useConnectionStore.getState().activeConnectionId
      if (connId) {
        queryClient.invalidateQueries({ queryKey: queryKeys.vms(connId) })
      }
    },
    onError: (error: Error) => {
      addToast(error.message || 'Failed to suspend VM', 'error')
    },
  })
}

export const useResumeVM = () => {
  const queryClient = useQueryClient()
  const { addToast } = useToast()

  return useMutation({
    mutationFn: ({ node, vmid }: { node: string; vmid: number }) => {
      const connId = useConnectionStore.getState().activeConnectionId!
      return api.resumeVM(connId, node, vmid)
    },
    onSuccess: () => {
      const connId = useConnectionStore.getState().activeConnectionId
      if (connId) {
        queryClient.invalidateQueries({ queryKey: queryKeys.vms(connId) })
      }
    },
    onError: (error: Error) => {
      addToast(error.message || 'Failed to resume VM', 'error')
    },
  })
}

// Disk management hooks
export const useDisks = (connectionId: string, node: string, vmid: number) => {
  return useQuery({
    queryKey: queryKeys.disks(connectionId, node, vmid),
    queryFn: () => api.getDisks(connectionId, node, vmid),
    enabled: !!connectionId && !!node && vmid > 0,
  })
}

export const useAddDisk = () => {
  const queryClient = useQueryClient()
  const { addToast } = useToast()

  return useMutation({
    mutationFn: ({
      node,
      vmid,
      config,
    }: {
      node: string
      vmid: number
      config: AddDiskConfig
    }) => {
      const connId = useConnectionStore.getState().activeConnectionId!
      return api.addDisk(connId, node, vmid, config)
    },
    onSuccess: (_data, variables) => {
      const connId = useConnectionStore.getState().activeConnectionId
      if (connId) {
        queryClient.invalidateQueries({
          queryKey: queryKeys.disks(connId, variables.node, variables.vmid),
        })
      }
    },
    onError: (error: Error) => {
      addToast(error.message || 'Failed to add disk', 'error')
    },
  })
}

export const useResizeDisk = () => {
  const queryClient = useQueryClient()
  const { addToast } = useToast()

  return useMutation({
    mutationFn: ({
      node,
      vmid,
      disk,
      size,
    }: {
      node: string
      vmid: number
      disk: string
      size: number
    }) => {
      const connId = useConnectionStore.getState().activeConnectionId!
      return api.resizeDisk(connId, node, vmid, disk, size)
    },
    onSuccess: (_data, variables) => {
      const connId = useConnectionStore.getState().activeConnectionId
      if (connId) {
        queryClient.invalidateQueries({
          queryKey: queryKeys.disks(connId, variables.node, variables.vmid),
        })
      }
    },
    onError: (error: Error) => {
      addToast(error.message || 'Failed to resize disk', 'error')
    },
  })
}

export const useRemoveDisk = () => {
  const queryClient = useQueryClient()
  const { addToast } = useToast()

  return useMutation({
    mutationFn: ({
      node,
      vmid,
      disk,
    }: {
      node: string
      vmid: number
      disk: string
    }) => {
      const connId = useConnectionStore.getState().activeConnectionId!
      return api.removeDisk(connId, node, vmid, disk)
    },
    onSuccess: (_data, variables) => {
      const connId = useConnectionStore.getState().activeConnectionId
      if (connId) {
        queryClient.invalidateQueries({
          queryKey: queryKeys.disks(connId, variables.node, variables.vmid),
        })
      }
    },
    onError: (error: Error) => {
      addToast(error.message || 'Failed to remove disk', 'error')
    },
  })
}

export const useMoveDisk = () => {
  const queryClient = useQueryClient()
  const { addToast } = useToast()

  return useMutation({
    mutationFn: ({
      node,
      vmid,
      disk,
      storage,
    }: {
      node: string
      vmid: number
      disk: string
      storage: string
    }) => {
      const connId = useConnectionStore.getState().activeConnectionId!
      return api.moveDisk(connId, node, vmid, disk, storage)
    },
    onSuccess: (_data, variables) => {
      const connId = useConnectionStore.getState().activeConnectionId
      if (connId) {
        queryClient.invalidateQueries({
          queryKey: queryKeys.disks(connId, variables.node, variables.vmid),
        })
      }
    },
    onError: (error: Error) => {
      addToast(error.message || 'Failed to move disk', 'error')
    },
  })
}

// Network management hooks
export const useNetworkInterfaces = (connectionId: string, node: string, vmid: number) => {
  return useQuery({
    queryKey: queryKeys.networks(connectionId, node, vmid),
    queryFn: () => api.getNetworkInterfaces(connectionId, node, vmid),
    enabled: !!connectionId && !!node && vmid > 0,
  })
}

export const useAddNIC = () => {
  const queryClient = useQueryClient()
  const { addToast } = useToast()

  return useMutation({
    mutationFn: ({
      node,
      vmid,
      config,
    }: {
      node: string
      vmid: number
      config: AddNICConfig
    }) => {
      const connId = useConnectionStore.getState().activeConnectionId!
      return api.addNIC(connId, node, vmid, config)
    },
    onSuccess: (_data, variables) => {
      const connId = useConnectionStore.getState().activeConnectionId
      if (connId) {
        queryClient.invalidateQueries({
          queryKey: queryKeys.networks(connId, variables.node, variables.vmid),
        })
      }
    },
    onError: (error: Error) => {
      addToast(error.message || 'Failed to add NIC', 'error')
    },
  })
}

export const useEditNIC = () => {
  const queryClient = useQueryClient()
  const { addToast } = useToast()

  return useMutation({
    mutationFn: ({
      node,
      vmid,
      nic,
      config,
    }: {
      node: string
      vmid: number
      nic: string
      config: EditNICConfig
    }) => {
      const connId = useConnectionStore.getState().activeConnectionId!
      return api.editNIC(connId, node, vmid, nic, config)
    },
    onSuccess: (_data, variables) => {
      const connId = useConnectionStore.getState().activeConnectionId
      if (connId) {
        queryClient.invalidateQueries({
          queryKey: queryKeys.networks(connId, variables.node, variables.vmid),
        })
      }
    },
    onError: (error: Error) => {
      addToast(error.message || 'Failed to edit NIC', 'error')
    },
  })
}

export const useRemoveNIC = () => {
  const queryClient = useQueryClient()
  const { addToast } = useToast()

  return useMutation({
    mutationFn: ({
      node,
      vmid,
      nic,
    }: {
      node: string
      vmid: number
      nic: string
    }) => {
      const connId = useConnectionStore.getState().activeConnectionId!
      return api.removeNIC(connId, node, vmid, nic)
    },
    onSuccess: (_data, variables) => {
      const connId = useConnectionStore.getState().activeConnectionId
      if (connId) {
        queryClient.invalidateQueries({
          queryKey: queryKeys.networks(connId, variables.node, variables.vmid),
        })
      }
    },
    onError: (error: Error) => {
      addToast(error.message || 'Failed to remove NIC', 'error')
    },
  })
}

// Snapshot management hooks
export const useSnapshots = (connectionId: string, node: string, vmid: number) => {
  return useQuery({
    queryKey: queryKeys.snapshots(connectionId, node, vmid),
    queryFn: () => api.getSnapshots(connectionId, node, vmid),
    enabled: !!connectionId && !!node && vmid > 0,
  })
}

export const useCreateSnapshot = () => {
  const queryClient = useQueryClient()
  const { addToast } = useToast()

  return useMutation({
    mutationFn: ({
      node,
      vmid,
      config,
    }: {
      node: string
      vmid: number
      config: CreateSnapshotConfig
    }) => {
      const connId = useConnectionStore.getState().activeConnectionId!
      return api.createSnapshot(connId, node, vmid, config)
    },
    onSuccess: (_data, variables) => {
      const connId = useConnectionStore.getState().activeConnectionId
      if (connId) {
        queryClient.invalidateQueries({
          queryKey: queryKeys.snapshots(connId, variables.node, variables.vmid),
        })
      }
    },
    onError: (error: Error) => {
      addToast(error.message || 'Failed to create snapshot', 'error')
    },
  })
}

export const useDeleteSnapshot = () => {
  const queryClient = useQueryClient()
  const { addToast } = useToast()

  return useMutation({
    mutationFn: ({
      node,
      vmid,
      name,
    }: {
      node: string
      vmid: number
      name: string
    }) => {
      const connId = useConnectionStore.getState().activeConnectionId!
      return api.deleteSnapshot(connId, node, vmid, name)
    },
    onSuccess: (_data, variables) => {
      const connId = useConnectionStore.getState().activeConnectionId
      if (connId) {
        queryClient.invalidateQueries({
          queryKey: queryKeys.snapshots(connId, variables.node, variables.vmid),
        })
      }
    },
    onError: (error: Error) => {
      addToast(error.message || 'Failed to delete snapshot', 'error')
    },
  })
}

export const useRollbackSnapshot = () => {
  const queryClient = useQueryClient()
  const { addToast } = useToast()

  return useMutation({
    mutationFn: ({
      node,
      vmid,
      name,
    }: {
      node: string
      vmid: number
      name: string
    }) => {
      const connId = useConnectionStore.getState().activeConnectionId!
      return api.rollbackSnapshot(connId, node, vmid, name)
    },
    onSuccess: (_data, variables) => {
      const connId = useConnectionStore.getState().activeConnectionId
      if (connId) {
        queryClient.invalidateQueries({
          queryKey: queryKeys.snapshots(connId, variables.node, variables.vmid),
        })
      }
    },
    onError: (error: Error) => {
      addToast(error.message || 'Failed to rollback snapshot', 'error')
    },
  })
}

// VM migration hooks
export const useMigrateVM = () => {
  const queryClient = useQueryClient()
  const { addToast } = useToast()

  return useMutation({
    mutationFn: ({
      node,
      vmid,
      targetNode,
      online,
    }: {
      node: string
      vmid: number
      targetNode: string
      online: boolean
    }) => {
      const connId = useConnectionStore.getState().activeConnectionId!
      return api.migrateVM(connId, node, vmid, targetNode, online)
    },
    onSuccess: () => {
      const connId = useConnectionStore.getState().activeConnectionId
      if (connId) {
        queryClient.invalidateQueries({ queryKey: queryKeys.vms(connId) })
      }
    },
    onError: (error: Error) => {
      addToast(error.message || 'Failed to migrate VM', 'error')
    },
  })
}

// Console proxy hooks
export const useVNCProxy = (connectionId: string, node: string, vmid: number) => {
  return useQuery({
    queryKey: queryKeys.vncProxy(connectionId, node, vmid),
    queryFn: () => api.createVNCProxy(connectionId, node, vmid),
    enabled: false, // Manual trigger only
    retry: false,
  })
}

export const useTermProxy = (connectionId: string, node: string, vmid: number) => {
  return useQuery({
    queryKey: queryKeys.termProxy(connectionId, node, vmid),
    queryFn: () => api.createTermProxy(connectionId, node, vmid),
    enabled: false, // Manual trigger only
    retry: false,
  })
}

// Backup management hooks
export const useBackupJobs = (connectionId: string | null) => {
  return useQuery({
    queryKey: queryKeys.backupJobs(connectionId!),
    queryFn: () => api.getBackupJobs(connectionId!),
    enabled: !!connectionId,
  })
}

export const useBackups = (connectionId: string | null, storage?: string) => {
  return useQuery({
    queryKey: queryKeys.backups(connectionId!, storage),
    queryFn: () => api.getBackups(connectionId!, storage),
    enabled: !!connectionId,
  })
}

export const useCreateBackupJob = () => {
  const queryClient = useQueryClient()
  const { addToast } = useToast()

  return useMutation({
    mutationFn: ({ config }: { config: BackupJobConfig }) => {
      const connId = useConnectionStore.getState().activeConnectionId!
      return api.createBackupJob(connId, config)
    },
    onSuccess: () => {
      const connId = useConnectionStore.getState().activeConnectionId
      if (connId) {
        queryClient.invalidateQueries({ queryKey: queryKeys.backupJobs(connId) })
      }
    },
    onError: (error: Error) => {
      addToast(error.message || 'Failed to create backup job', 'error')
    },
  })
}

export const useUpdateBackupJob = () => {
  const queryClient = useQueryClient()
  const { addToast } = useToast()

  return useMutation({
    mutationFn: ({ id, config }: { id: string; config: BackupJobConfig }) => {
      const connId = useConnectionStore.getState().activeConnectionId!
      return api.updateBackupJob(connId, id, config)
    },
    onSuccess: () => {
      const connId = useConnectionStore.getState().activeConnectionId
      if (connId) {
        queryClient.invalidateQueries({ queryKey: queryKeys.backupJobs(connId) })
      }
    },
    onError: (error: Error) => {
      addToast(error.message || 'Failed to update backup job', 'error')
    },
  })
}

export const useDeleteBackupJob = () => {
  const queryClient = useQueryClient()
  const { addToast } = useToast()

  return useMutation({
    mutationFn: ({ id }: { id: string }) => {
      const connId = useConnectionStore.getState().activeConnectionId!
      return api.deleteBackupJob(connId, id)
    },
    onSuccess: () => {
      const connId = useConnectionStore.getState().activeConnectionId
      if (connId) {
        queryClient.invalidateQueries({ queryKey: queryKeys.backupJobs(connId) })
      }
    },
    onError: (error: Error) => {
      addToast(error.message || 'Failed to delete backup job', 'error')
    },
  })
}

export const useRunBackup = () => {
  const queryClient = useQueryClient()
  const { addToast } = useToast()

  return useMutation({
    mutationFn: ({ config }: { config: BackupJobConfig }) => {
      const connId = useConnectionStore.getState().activeConnectionId!
      return api.runBackup(connId, config)
    },
    onSuccess: () => {
      const connId = useConnectionStore.getState().activeConnectionId
      if (connId) {
        queryClient.invalidateQueries({ queryKey: queryKeys.tasks(connId) })
      }
    },
    onError: (error: Error) => {
      addToast(error.message || 'Failed to run backup', 'error')
    },
  })
}

export const useRestoreBackup = () => {
  const queryClient = useQueryClient()
  const { addToast } = useToast()

  return useMutation({
    mutationFn: ({ volid, config }: { volid: string; config: RestoreConfig }) => {
      const connId = useConnectionStore.getState().activeConnectionId!
      return api.restoreBackup(connId, volid, config)
    },
    onSuccess: () => {
      const connId = useConnectionStore.getState().activeConnectionId
      if (connId) {
        queryClient.invalidateQueries({ queryKey: queryKeys.vms(connId) })
        queryClient.invalidateQueries({ queryKey: queryKeys.tasks(connId) })
      }
    },
    onError: (error: Error) => {
      addToast(error.message || 'Failed to restore backup', 'error')
    },
  })
}

export const useDeleteBackup = () => {
  const queryClient = useQueryClient()
  const { addToast } = useToast()

  return useMutation({
    mutationFn: ({ volid }: { volid: string }) => {
      const connId = useConnectionStore.getState().activeConnectionId!
      return api.deleteBackup(connId, volid)
    },
    onSuccess: () => {
      const connId = useConnectionStore.getState().activeConnectionId
      if (connId) {
        queryClient.invalidateQueries({ queryKey: queryKeys.backups(connId) })
      }
    },
    onError: (error: Error) => {
      addToast(error.message || 'Failed to delete backup', 'error')
    },
  })
}
