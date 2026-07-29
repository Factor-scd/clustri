import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import * as api from '@/lib/tauri'
import { useConnectionStore } from '@/stores/connectionStore'
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
  const activeConnectionId = useConnectionStore((s) => s.activeConnectionId)
  
  return useMutation({
    mutationFn: ({ node, vmid }: { node: string; vmid: number }) =>
      api.startVM(activeConnectionId!, node, vmid),
    onSuccess: () => {
      if (activeConnectionId) {
        queryClient.invalidateQueries({ queryKey: queryKeys.vms(activeConnectionId) })
      }
    },
  })
}

export const useStopVM = () => {
  const queryClient = useQueryClient()
  const activeConnectionId = useConnectionStore((s) => s.activeConnectionId)
  
  return useMutation({
    mutationFn: ({ node, vmid }: { node: string; vmid: number }) =>
      api.stopVM(activeConnectionId!, node, vmid),
    onSuccess: () => {
      if (activeConnectionId) {
        queryClient.invalidateQueries({ queryKey: queryKeys.vms(activeConnectionId) })
      }
    },
  })
}

export const useShutdownVM = () => {
  const queryClient = useQueryClient()
  const activeConnectionId = useConnectionStore((s) => s.activeConnectionId)
  
  return useMutation({
    mutationFn: ({ node, vmid }: { node: string; vmid: number }) =>
      api.shutdownVM(activeConnectionId!, node, vmid),
    onSuccess: () => {
      if (activeConnectionId) {
        queryClient.invalidateQueries({ queryKey: queryKeys.vms(activeConnectionId) })
      }
    },
  })
}

export const useRebootVM = () => {
  const queryClient = useQueryClient()
  const activeConnectionId = useConnectionStore((s) => s.activeConnectionId)
  
  return useMutation({
    mutationFn: ({ node, vmid }: { node: string; vmid: number }) =>
      api.rebootVM(activeConnectionId!, node, vmid),
    onSuccess: () => {
      if (activeConnectionId) {
        queryClient.invalidateQueries({ queryKey: queryKeys.vms(activeConnectionId) })
      }
    },
  })
}

export const useSuspendVM = () => {
  const queryClient = useQueryClient()
  const activeConnectionId = useConnectionStore((s) => s.activeConnectionId)
  
  return useMutation({
    mutationFn: ({ node, vmid }: { node: string; vmid: number }) =>
      api.suspendVM(activeConnectionId!, node, vmid),
    onSuccess: () => {
      if (activeConnectionId) {
        queryClient.invalidateQueries({ queryKey: queryKeys.vms(activeConnectionId) })
      }
    },
  })
}

export const useResumeVM = () => {
  const queryClient = useQueryClient()
  const activeConnectionId = useConnectionStore((s) => s.activeConnectionId)
  
  return useMutation({
    mutationFn: ({ node, vmid }: { node: string; vmid: number }) =>
      api.resumeVM(activeConnectionId!, node, vmid),
    onSuccess: () => {
      if (activeConnectionId) {
        queryClient.invalidateQueries({ queryKey: queryKeys.vms(activeConnectionId) })
      }
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
  const activeConnectionId = useConnectionStore((s) => s.activeConnectionId)

  return useMutation({
    mutationFn: ({
      node,
      vmid,
      config,
    }: {
      node: string
      vmid: number
      config: AddDiskConfig
    }) => api.addDisk(activeConnectionId!, node, vmid, config),
    onSuccess: (_data, variables) => {
      if (activeConnectionId) {
        queryClient.invalidateQueries({
          queryKey: queryKeys.disks(activeConnectionId, variables.node, variables.vmid),
        })
      }
    },
  })
}

export const useResizeDisk = () => {
  const queryClient = useQueryClient()
  const activeConnectionId = useConnectionStore((s) => s.activeConnectionId)

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
    }) => api.resizeDisk(activeConnectionId!, node, vmid, disk, size),
    onSuccess: (_data, variables) => {
      if (activeConnectionId) {
        queryClient.invalidateQueries({
          queryKey: queryKeys.disks(activeConnectionId, variables.node, variables.vmid),
        })
      }
    },
  })
}

export const useRemoveDisk = () => {
  const queryClient = useQueryClient()
  const activeConnectionId = useConnectionStore((s) => s.activeConnectionId)

  return useMutation({
    mutationFn: ({
      node,
      vmid,
      disk,
    }: {
      node: string
      vmid: number
      disk: string
    }) => api.removeDisk(activeConnectionId!, node, vmid, disk),
    onSuccess: (_data, variables) => {
      if (activeConnectionId) {
        queryClient.invalidateQueries({
          queryKey: queryKeys.disks(activeConnectionId, variables.node, variables.vmid),
        })
      }
    },
  })
}

export const useMoveDisk = () => {
  const queryClient = useQueryClient()
  const activeConnectionId = useConnectionStore((s) => s.activeConnectionId)

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
    }) => api.moveDisk(activeConnectionId!, node, vmid, disk, storage),
    onSuccess: (_data, variables) => {
      if (activeConnectionId) {
        queryClient.invalidateQueries({
          queryKey: queryKeys.disks(activeConnectionId, variables.node, variables.vmid),
        })
      }
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
  const activeConnectionId = useConnectionStore((s) => s.activeConnectionId)

  return useMutation({
    mutationFn: ({
      node,
      vmid,
      config,
    }: {
      node: string
      vmid: number
      config: AddNICConfig
    }) => api.addNIC(activeConnectionId!, node, vmid, config),
    onSuccess: (_data, variables) => {
      if (activeConnectionId) {
        queryClient.invalidateQueries({
          queryKey: queryKeys.networks(activeConnectionId, variables.node, variables.vmid),
        })
      }
    },
  })
}

export const useEditNIC = () => {
  const queryClient = useQueryClient()
  const activeConnectionId = useConnectionStore((s) => s.activeConnectionId)

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
    }) => api.editNIC(activeConnectionId!, node, vmid, nic, config),
    onSuccess: (_data, variables) => {
      if (activeConnectionId) {
        queryClient.invalidateQueries({
          queryKey: queryKeys.networks(activeConnectionId, variables.node, variables.vmid),
        })
      }
    },
  })
}

export const useRemoveNIC = () => {
  const queryClient = useQueryClient()
  const activeConnectionId = useConnectionStore((s) => s.activeConnectionId)

  return useMutation({
    mutationFn: ({
      node,
      vmid,
      nic,
    }: {
      node: string
      vmid: number
      nic: string
    }) => api.removeNIC(activeConnectionId!, node, vmid, nic),
    onSuccess: (_data, variables) => {
      if (activeConnectionId) {
        queryClient.invalidateQueries({
          queryKey: queryKeys.networks(activeConnectionId, variables.node, variables.vmid),
        })
      }
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
  const activeConnectionId = useConnectionStore((s) => s.activeConnectionId)

  return useMutation({
    mutationFn: ({
      node,
      vmid,
      config,
    }: {
      node: string
      vmid: number
      config: CreateSnapshotConfig
    }) => api.createSnapshot(activeConnectionId!, node, vmid, config),
    onSuccess: (_data, variables) => {
      if (activeConnectionId) {
        queryClient.invalidateQueries({
          queryKey: queryKeys.snapshots(activeConnectionId, variables.node, variables.vmid),
        })
      }
    },
  })
}

export const useDeleteSnapshot = () => {
  const queryClient = useQueryClient()
  const activeConnectionId = useConnectionStore((s) => s.activeConnectionId)

  return useMutation({
    mutationFn: ({
      node,
      vmid,
      name,
    }: {
      node: string
      vmid: number
      name: string
    }) => api.deleteSnapshot(activeConnectionId!, node, vmid, name),
    onSuccess: (_data, variables) => {
      if (activeConnectionId) {
        queryClient.invalidateQueries({
          queryKey: queryKeys.snapshots(activeConnectionId, variables.node, variables.vmid),
        })
      }
    },
  })
}

export const useRollbackSnapshot = () => {
  const queryClient = useQueryClient()
  const activeConnectionId = useConnectionStore((s) => s.activeConnectionId)

  return useMutation({
    mutationFn: ({
      node,
      vmid,
      name,
    }: {
      node: string
      vmid: number
      name: string
    }) => api.rollbackSnapshot(activeConnectionId!, node, vmid, name),
    onSuccess: (_data, variables) => {
      if (activeConnectionId) {
        queryClient.invalidateQueries({
          queryKey: queryKeys.snapshots(activeConnectionId, variables.node, variables.vmid),
        })
      }
    },
  })
}

// VM migration hooks
export const useMigrateVM = () => {
  const queryClient = useQueryClient()
  const activeConnectionId = useConnectionStore((s) => s.activeConnectionId)

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
    }) => api.migrateVM(activeConnectionId!, node, vmid, targetNode, online),
    onSuccess: () => {
      if (activeConnectionId) {
        queryClient.invalidateQueries({ queryKey: queryKeys.vms(activeConnectionId) })
      }
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
  const activeConnectionId = useConnectionStore((s) => s.activeConnectionId)

  return useMutation({
    mutationFn: ({ config }: { config: BackupJobConfig }) =>
      api.createBackupJob(activeConnectionId!, config),
    onSuccess: () => {
      if (activeConnectionId) {
        queryClient.invalidateQueries({ queryKey: queryKeys.backupJobs(activeConnectionId) })
      }
    },
  })
}

export const useUpdateBackupJob = () => {
  const queryClient = useQueryClient()
  const activeConnectionId = useConnectionStore((s) => s.activeConnectionId)

  return useMutation({
    mutationFn: ({ id, config }: { id: string; config: BackupJobConfig }) =>
      api.updateBackupJob(activeConnectionId!, id, config),
    onSuccess: () => {
      if (activeConnectionId) {
        queryClient.invalidateQueries({ queryKey: queryKeys.backupJobs(activeConnectionId) })
      }
    },
  })
}

export const useDeleteBackupJob = () => {
  const queryClient = useQueryClient()
  const activeConnectionId = useConnectionStore((s) => s.activeConnectionId)

  return useMutation({
    mutationFn: ({ id }: { id: string }) =>
      api.deleteBackupJob(activeConnectionId!, id),
    onSuccess: () => {
      if (activeConnectionId) {
        queryClient.invalidateQueries({ queryKey: queryKeys.backupJobs(activeConnectionId) })
      }
    },
  })
}

export const useRunBackup = () => {
  const queryClient = useQueryClient()
  const activeConnectionId = useConnectionStore((s) => s.activeConnectionId)

  return useMutation({
    mutationFn: ({ config }: { config: BackupJobConfig }) =>
      api.runBackup(activeConnectionId!, config),
    onSuccess: () => {
      if (activeConnectionId) {
        queryClient.invalidateQueries({ queryKey: queryKeys.tasks(activeConnectionId) })
      }
    },
  })
}

export const useRestoreBackup = () => {
  const queryClient = useQueryClient()
  const activeConnectionId = useConnectionStore((s) => s.activeConnectionId)

  return useMutation({
    mutationFn: ({ volid, config }: { volid: string; config: RestoreConfig }) =>
      api.restoreBackup(activeConnectionId!, volid, config),
    onSuccess: () => {
      if (activeConnectionId) {
        queryClient.invalidateQueries({ queryKey: queryKeys.vms(activeConnectionId) })
        queryClient.invalidateQueries({ queryKey: queryKeys.tasks(activeConnectionId) })
      }
    },
  })
}

export const useDeleteBackup = () => {
  const queryClient = useQueryClient()
  const activeConnectionId = useConnectionStore((s) => s.activeConnectionId)

  return useMutation({
    mutationFn: ({ volid }: { volid: string }) =>
      api.deleteBackup(activeConnectionId!, volid),
    onSuccess: () => {
      if (activeConnectionId) {
        queryClient.invalidateQueries({ queryKey: queryKeys.backups(activeConnectionId) })
      }
    },
  })
}
