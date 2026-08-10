import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import * as api from '@/lib/tauri'
import { useConnectionStore } from '@/stores/connectionStore'
import { useToast } from '@/components/ui/toast'
import type { AddDiskConfig, AddNICConfig, EditNICConfig, UpdateVMConfig, CreateSnapshotConfig, BackupJobConfig, RestoreConfig } from '@/types/proxmox'

// Query keys
export const queryKeys = {
  nodes: (connectionId: string) => ['nodes', connectionId],
  vms: (connectionId: string) => ['vms', connectionId],
  storage: (connectionId: string) => ['storage', connectionId],
  storageContent: (connectionId: string, node: string, storage: string) => ['storageContent', connectionId, node, storage],
  storageDetail: (connectionId: string, node: string, storage: string) => ['storageDetail', connectionId, node, storage],
  tasks: (connectionId: string) => ['tasks', connectionId],
  cluster: (connectionId: string) => ['cluster', connectionId],
  disks: (connectionId: string, node: string, vmid: number, vmType: string) => ['disks', connectionId, node, vmid, vmType],
  networks: (connectionId: string, node: string, vmid: number, vmType: string) => ['networks', connectionId, node, vmid, vmType],
  snapshots: (connectionId: string, node: string, vmid: number, vmType: string) => ['snapshots', connectionId, node, vmid, vmType],
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

export const useStorageContent = (connectionId: string | null, node: string | null, storage: string | null) => {
  return useQuery({
    queryKey: queryKeys.storageContent(connectionId!, node!, storage!),
    queryFn: () => api.getStorageContent(connectionId!, storage!, node!),
    enabled: !!connectionId && !!node && !!storage,
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
    mutationFn: ({ node, vmid, vmType }: { node: string; vmid: number; vmType: string }) => {
      const connId = useConnectionStore.getState().activeConnectionId!
      return api.startVM(connId, node, vmid, vmType)
    },
    onSuccess: () => {
      addToast('VM started', 'success')
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
    mutationFn: ({ node, vmid, vmType }: { node: string; vmid: number; vmType: string }) => {
      const connId = useConnectionStore.getState().activeConnectionId!
      return api.stopVM(connId, node, vmid, vmType)
    },
    onSuccess: () => {
      addToast('VM stopped', 'success')
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
    mutationFn: ({ node, vmid, vmType }: { node: string; vmid: number; vmType: string }) => {
      const connId = useConnectionStore.getState().activeConnectionId!
      return api.shutdownVM(connId, node, vmid, vmType)
    },
    onSuccess: () => {
      addToast('VM shut down', 'success')
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
    mutationFn: ({ node, vmid, vmType }: { node: string; vmid: number; vmType: string }) => {
      const connId = useConnectionStore.getState().activeConnectionId!
      return api.rebootVM(connId, node, vmid, vmType)
    },
    onSuccess: () => {
      addToast('VM rebooting', 'success')
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
    mutationFn: ({ node, vmid, vmType }: { node: string; vmid: number; vmType: string }) => {
      const connId = useConnectionStore.getState().activeConnectionId!
      return api.suspendVM(connId, node, vmid, vmType)
    },
    onSuccess: () => {
      addToast('VM suspended', 'success')
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
    mutationFn: ({ node, vmid, vmType }: { node: string; vmid: number; vmType: string }) => {
      const connId = useConnectionStore.getState().activeConnectionId!
      return api.resumeVM(connId, node, vmid, vmType)
    },
    onSuccess: () => {
      addToast('VM resumed', 'success')
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
export const useDisks = (connectionId: string, node: string, vmid: number, vmType: string) => {
  return useQuery({
    queryKey: queryKeys.disks(connectionId, node, vmid, vmType),
    queryFn: () => api.getDisks(connectionId, node, vmid, vmType),
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
      vmType,
      config,
    }: {
      node: string
      vmid: number
      vmType: string
      config: AddDiskConfig
    }) => {
      const connId = useConnectionStore.getState().activeConnectionId!
      return api.addDisk(connId, node, vmid, vmType, config)
    },
    onSuccess: (_data, variables) => {
      addToast('Disk added', 'success')
      const connId = useConnectionStore.getState().activeConnectionId
      if (connId) {
        queryClient.invalidateQueries({
          queryKey:           queryKeys.disks(connId, variables.node, variables.vmid, variables.vmType),
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
      vmType,
      disk,
      size,
    }: {
      node: string
      vmid: number
      vmType: string
      disk: string
      size: number
    }) => {
      const connId = useConnectionStore.getState().activeConnectionId!
      return api.resizeDisk(connId, node, vmid, vmType, disk, size)
    },
    onSuccess: (_data, variables) => {
      addToast('Disk resized', 'success')
      const connId = useConnectionStore.getState().activeConnectionId
      if (connId) {
        queryClient.invalidateQueries({
          queryKey:           queryKeys.disks(connId, variables.node, variables.vmid, variables.vmType),
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
      vmType,
      disk,
    }: {
      node: string
      vmid: number
      vmType: string
      disk: string
    }) => {
      const connId = useConnectionStore.getState().activeConnectionId!
      return api.removeDisk(connId, node, vmid, vmType, disk)
    },
    onSuccess: (_data, variables) => {
      addToast('Disk removed', 'success')
      const connId = useConnectionStore.getState().activeConnectionId
      if (connId) {
        queryClient.invalidateQueries({
          queryKey:           queryKeys.disks(connId, variables.node, variables.vmid, variables.vmType),
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
      vmType,
      disk,
      storage,
    }: {
      node: string
      vmid: number
      vmType: string
      disk: string
      storage: string
    }) => {
      const connId = useConnectionStore.getState().activeConnectionId!
      return api.moveDisk(connId, node, vmid, vmType, disk, storage)
    },
    onSuccess: (_data, variables) => {
      addToast('Disk moved', 'success')
      const connId = useConnectionStore.getState().activeConnectionId
      if (connId) {
        queryClient.invalidateQueries({
          queryKey:           queryKeys.disks(connId, variables.node, variables.vmid, variables.vmType),
        })
      }
    },
    onError: (error: Error) => {
      addToast(error.message || 'Failed to move disk', 'error')
    },
  })
}

// Network management hooks
export const useNetworkInterfaces = (connectionId: string, node: string, vmid: number, vmType: string) => {
  return useQuery({
    queryKey: queryKeys.networks(connectionId, node, vmid, vmType),
    queryFn: () => api.getNetworkInterfaces(connectionId, node, vmid, vmType),
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
      vmType,
      config,
    }: {
      node: string
      vmid: number
      vmType: string
      config: AddNICConfig
    }) => {
      const connId = useConnectionStore.getState().activeConnectionId!
      return api.addNIC(connId, node, vmid, vmType, config)
    },
    onSuccess: (_data, variables) => {
      addToast('Network interface added', 'success')
      const connId = useConnectionStore.getState().activeConnectionId
      if (connId) {
        queryClient.invalidateQueries({
          queryKey:           queryKeys.networks(connId, variables.node, variables.vmid, variables.vmType),
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
      vmType,
      nic,
      config,
    }: {
      node: string
      vmid: number
      vmType: string
      nic: string
      config: EditNICConfig
    }) => {
      const connId = useConnectionStore.getState().activeConnectionId!
      return api.editNIC(connId, node, vmid, vmType, nic, config)
    },
    onSuccess: (_data, variables) => {
      addToast('Network interface updated', 'success')
      const connId = useConnectionStore.getState().activeConnectionId
      if (connId) {
        queryClient.invalidateQueries({
          queryKey:           queryKeys.networks(connId, variables.node, variables.vmid, variables.vmType),
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
      vmType,
      nic,
    }: {
      node: string
      vmid: number
      vmType: string
      nic: string
    }) => {
      const connId = useConnectionStore.getState().activeConnectionId!
      return api.removeNIC(connId, node, vmid, vmType, nic)
    },
    onSuccess: (_data, variables) => {
      addToast('Network interface removed', 'success')
      const connId = useConnectionStore.getState().activeConnectionId
      if (connId) {
        queryClient.invalidateQueries({
          queryKey:           queryKeys.networks(connId, variables.node, variables.vmid, variables.vmType),
        })
      }
    },
    onError: (error: Error) => {
      addToast(error.message || 'Failed to remove NIC', 'error')
    },
  })
}

// Snapshot management hooks
export const useSnapshots = (connectionId: string, node: string, vmid: number, vmType: string) => {
  return useQuery({
    queryKey: queryKeys.snapshots(connectionId, node, vmid, vmType),
    queryFn: () => api.getSnapshots(connectionId, node, vmid, vmType),
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
      vmType,
      config,
    }: {
      node: string
      vmid: number
      vmType: string
      config: CreateSnapshotConfig
    }) => {
      const connId = useConnectionStore.getState().activeConnectionId!
      return api.createSnapshot(connId, node, vmid, vmType, config)
    },
    onSuccess: (_data, variables) => {
      addToast('Snapshot created', 'success')
      const connId = useConnectionStore.getState().activeConnectionId
      if (connId) {
        queryClient.invalidateQueries({
          queryKey:           queryKeys.snapshots(connId, variables.node, variables.vmid, variables.vmType),
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
      vmType,
      name,
    }: {
      node: string
      vmid: number
      vmType: string
      name: string
    }) => {
      const connId = useConnectionStore.getState().activeConnectionId!
      return api.deleteSnapshot(connId, node, vmid, vmType, name)
    },
    onSuccess: (_data, variables) => {
      addToast('Snapshot deleted', 'success')
      const connId = useConnectionStore.getState().activeConnectionId
      if (connId) {
        queryClient.invalidateQueries({
          queryKey:           queryKeys.snapshots(connId, variables.node, variables.vmid, variables.vmType),
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
      vmType,
      name,
    }: {
      node: string
      vmid: number
      vmType: string
      name: string
    }) => {
      const connId = useConnectionStore.getState().activeConnectionId!
      return api.rollbackSnapshot(connId, node, vmid, vmType, name)
    },
    onSuccess: (_data, variables) => {
      addToast('Snapshot restored', 'success')
      const connId = useConnectionStore.getState().activeConnectionId
      if (connId) {
        queryClient.invalidateQueries({
          queryKey:           queryKeys.snapshots(connId, variables.node, variables.vmid, variables.vmType),
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
      vmType,
      targetNode,
      online,
    }: {
      node: string
      vmid: number
      vmType: string
      targetNode: string
      online: boolean
    }) => {
      const connId = useConnectionStore.getState().activeConnectionId!
      return api.migrateVM(connId, node, vmid, vmType, targetNode, online)
    },
    onSuccess: () => {
      addToast('Migration started', 'success')
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

export const useUpdateVMConfig = () => {
  const queryClient = useQueryClient()
  const { addToast } = useToast()

  return useMutation({
    mutationFn: ({
      node,
      vmid,
      vmType,
      config,
    }: {
      node: string
      vmid: number
      vmType: string
      config: UpdateVMConfig
    }) => {
      const connId = useConnectionStore.getState().activeConnectionId!
      return api.updateVMConfig(connId, node, vmid, vmType, config)
    },
    onSuccess: () => {
      addToast('VM configuration updated', 'success')
      const connId = useConnectionStore.getState().activeConnectionId
      if (connId) {
        queryClient.invalidateQueries({ queryKey: queryKeys.vms(connId) })
      }
    },
    onError: (error: Error) => {
      addToast(error.message || 'Failed to update VM configuration', 'error')
    },
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
      addToast('Backup job created', 'success')
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
      addToast('Backup job updated', 'success')
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
      addToast('Backup job deleted', 'success')
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
      addToast('Backup started', 'success')
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
      addToast('Restore started', 'success')
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
      addToast('Backup deleted', 'success')
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
