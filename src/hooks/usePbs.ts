import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import * as api from '@/lib/tauri'
import { useConnectionStore } from '@/stores/connectionStore'
import { useToast } from '@/components/ui/toast'
import type { PbsSnapshot } from '@/types/pbs'

// Query keys
export const queryKeys = {
  pbsDatastores: (id: string) => ['pbsDatastores', id],
  pbsVersion: (id: string) => ['pbsVersion', id],
  pbsNodeStatus: (id: string) => ['pbsNodeStatus', id],
  pbsGroups: (id: string, store: string) => ['pbsGroups', id, store],
  pbsSnapshots: (id: string, store: string, backupId: string, backupType: string) => [
    'pbsSnapshots',
    id,
    store,
    backupId,
    backupType,
  ],
  pbsSnapshotFiles: (id: string, store: string, backupId: string, backupType: string, backupTime: number) => [
    'pbsSnapshotFiles',
    id,
    store,
    backupId,
    backupType,
    backupTime,
  ],
  pbsVerifyJobs: (id: string) => ['pbsVerifyJobs', id],
  pbsPruneJobs: (id: string) => ['pbsPruneJobs', id],
  pbsGcJobs: (id: string) => ['pbsGcJobs', id],
}

// Queries
export const usePbsDatastores = (connectionId: string | null) => {
  return useQuery({
    queryKey: queryKeys.pbsDatastores(connectionId!),
    queryFn: () => api.getPbsDatastores(connectionId!),
    enabled: !!connectionId,
    refetchInterval: 30000, // 30 seconds
  })
}

export const usePbsVersion = (connectionId: string | null) => {
  return useQuery({
    queryKey: queryKeys.pbsVersion(connectionId!),
    queryFn: () => api.getPbsVersion(connectionId!),
    enabled: !!connectionId,
    refetchInterval: 30000, // 30 seconds
  })
}

export const usePbsNodeStatus = (connectionId: string | null) => {
  return useQuery({
    queryKey: queryKeys.pbsNodeStatus(connectionId!),
    queryFn: () => api.getPbsNodeStatus(connectionId!),
    enabled: !!connectionId,
  })
}

export const usePbsGroups = (connectionId: string | null, store: string | null) => {
  return useQuery({
    queryKey: queryKeys.pbsGroups(connectionId!, store!),
    queryFn: () => api.getPbsGroups(connectionId!, store!),
    enabled: !!connectionId && !!store,
  })
}

export const usePbsSnapshots = (
  connectionId: string | null,
  store: string | null,
  backupId: string | null,
  backupType: PbsSnapshot['backupType'] | null,
) => {
  return useQuery({
    queryKey: queryKeys.pbsSnapshots(connectionId!, store!, backupId!, backupType!),
    queryFn: () => api.getPbsSnapshots(connectionId!, store!, backupId!, backupType!),
    enabled: !!connectionId && !!store && !!backupId && !!backupType,
  })
}

export const usePbsSnapshotFiles = (
  connectionId: string | null,
  store: string | null,
  backupId: string | null,
  backupType: PbsSnapshot['backupType'] | null,
  backupTime: number | null,
) => {
  return useQuery({
    queryKey: queryKeys.pbsSnapshotFiles(connectionId!, store!, backupId!, backupType!, backupTime!),
    queryFn: () => api.getPbsSnapshotFiles(connectionId!, store!, backupId!, backupType!, backupTime!),
    enabled: !!connectionId && !!store && !!backupId && !!backupType && !!backupTime,
  })
}

export const usePbsVerifyJobs = (connectionId: string | null) => {
  return useQuery({
    queryKey: queryKeys.pbsVerifyJobs(connectionId!),
    queryFn: () => api.getPbsVerifyJobs(connectionId!),
    enabled: !!connectionId,
  })
}

export const usePbsPruneJobs = (connectionId: string | null) => {
  return useQuery({
    queryKey: queryKeys.pbsPruneJobs(connectionId!),
    queryFn: () => api.getPbsPruneJobs(connectionId!),
    enabled: !!connectionId,
  })
}

export const usePbsGcJobs = (connectionId: string | null) => {
  return useQuery({
    queryKey: queryKeys.pbsGcJobs(connectionId!),
    queryFn: () => api.getPbsGcJobs(connectionId!),
    enabled: !!connectionId,
  })
}

// Mutations
export const usePbsDeleteSnapshot = () => {
  const queryClient = useQueryClient()
  const { addToast } = useToast()

  return useMutation({
    mutationFn: ({
      store,
      backupId,
      backupType,
      backupTime,
    }: {
      store: string
      backupId: string
      backupType: PbsSnapshot['backupType']
      backupTime: number
    }) => {
      const connId = useConnectionStore.getState().activeConnectionId!
      return api.deletePbsSnapshot(connId, store, backupId, backupType, backupTime)
    },
    onSuccess: (_data, variables) => {
      addToast('Snapshot deleted', 'success')
      const connId = useConnectionStore.getState().activeConnectionId
      if (connId) {
        queryClient.invalidateQueries({
          queryKey: queryKeys.pbsSnapshots(connId, variables.store, variables.backupId, variables.backupType),
        })
        queryClient.invalidateQueries({ queryKey: queryKeys.pbsDatastores(connId) })
      }
    },
    onError: (error: Error) => {
      addToast(error.message || 'Failed to delete snapshot', 'error')
    },
  })
}

export const usePbsDeleteGroup = () => {
  const queryClient = useQueryClient()
  const { addToast } = useToast()

  return useMutation({
    mutationFn: ({
      store,
      backupId,
      backupType,
    }: {
      store: string
      backupId: string
      backupType: PbsSnapshot['backupType']
    }) => {
      const connId = useConnectionStore.getState().activeConnectionId!
      return api.deletePbsGroup(connId, store, backupId, backupType)
    },
    onSuccess: (_data, variables) => {
      addToast('Backup group deleted', 'success')
      const connId = useConnectionStore.getState().activeConnectionId
      if (connId) {
        queryClient.invalidateQueries({ queryKey: queryKeys.pbsGroups(connId, variables.store) })
        queryClient.invalidateQueries({ queryKey: queryKeys.pbsDatastores(connId) })
      }
    },
    onError: (error: Error) => {
      addToast(error.message || 'Failed to delete backup group', 'error')
    },
  })
}

export const usePbsRunVerify = () => {
  const queryClient = useQueryClient()
  const { addToast } = useToast()

  return useMutation({
    mutationFn: ({ store }: { store: string }) => {
      const connId = useConnectionStore.getState().activeConnectionId!
      return api.runPbsVerify(connId, store)
    },
    onSuccess: () => {
      addToast('Verification started', 'success')
      const connId = useConnectionStore.getState().activeConnectionId
      if (connId) {
        queryClient.invalidateQueries({ queryKey: queryKeys.pbsDatastores(connId) })
        queryClient.invalidateQueries({ queryKey: queryKeys.pbsVerifyJobs(connId) })
      }
    },
    onError: (error: Error) => {
      addToast(error.message || 'Failed to start verification', 'error')
    },
  })
}

export const usePbsRunPrune = () => {
  const queryClient = useQueryClient()
  const { addToast } = useToast()

  return useMutation({
    mutationFn: ({
      store,
      keepLast,
      keepDaily,
      keepWeekly,
      keepMonthly,
      keepYearly,
      dryRun,
    }: {
      store: string
      keepLast?: number
      keepDaily?: number
      keepWeekly?: number
      keepMonthly?: number
      keepYearly?: number
      dryRun?: boolean
    }) => {
      const connId = useConnectionStore.getState().activeConnectionId!
      return api.runPbsPrune(
        connId,
        store,
        keepLast,
        keepDaily,
        keepWeekly,
        keepMonthly,
        keepYearly,
        dryRun ?? false,
      )
    },
    onSuccess: () => {
      addToast('Prune started', 'success')
      const connId = useConnectionStore.getState().activeConnectionId
      if (connId) {
        queryClient.invalidateQueries({ queryKey: queryKeys.pbsDatastores(connId) })
        queryClient.invalidateQueries({ queryKey: queryKeys.pbsPruneJobs(connId) })
      }
    },
    onError: (error: Error) => {
      addToast(error.message || 'Failed to start prune', 'error')
    },
  })
}

export const usePbsRunGc = () => {
  const queryClient = useQueryClient()
  const { addToast } = useToast()

  return useMutation({
    mutationFn: ({ store }: { store: string }) => {
      const connId = useConnectionStore.getState().activeConnectionId!
      return api.runPbsGc(connId, store)
    },
    onSuccess: () => {
      addToast('Garbage collection started', 'success')
      const connId = useConnectionStore.getState().activeConnectionId
      if (connId) {
        queryClient.invalidateQueries({ queryKey: queryKeys.pbsDatastores(connId) })
        queryClient.invalidateQueries({ queryKey: queryKeys.pbsGcJobs(connId) })
      }
    },
    onError: (error: Error) => {
      addToast(error.message || 'Failed to start garbage collection', 'error')
    },
  })
}

export const usePbsDownloadFile = () => {
  const { addToast } = useToast()

  return useMutation({
    mutationFn: async ({
      store,
      backupId,
      backupType,
      backupTime,
      fileName,
      decoded,
    }: {
      store: string
      backupId: string
      backupType: PbsSnapshot['backupType']
      backupTime: number
      fileName: string
      decoded: boolean
    }): Promise<string | null> => {
      const connId = useConnectionStore.getState().activeConnectionId!
      // In browser mock mode there is no save dialog, so default the target
      // path to the file name. In Tauri mode the native save dialog picks it.
      let savePath = fileName
      if (api.isTauri()) {
        const { save } = await import('@tauri-apps/plugin-dialog')
        const chosen = await save({ defaultPath: fileName })
        if (chosen === null) return null // dialog cancelled — skip the download
        savePath = chosen
      }
      return api.downloadPbsSnapshotFile(
        connId,
        store,
        backupId,
        backupType,
        backupTime,
        fileName,
        decoded,
        savePath,
      )
    },
    onSuccess: (savePath, variables) => {
      if (savePath === null) return // dialog cancelled — no toast
      addToast(`Downloaded ${variables.fileName}`, 'success')
    },
    onError: (error: Error) => {
      addToast(error.message || 'Failed to download file', 'error')
    },
  })
}
