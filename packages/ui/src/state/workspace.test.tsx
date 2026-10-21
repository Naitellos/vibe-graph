import { afterEach, describe, expect, it } from 'vitest'
import { useWorkspaceStore } from './workspace.js'

describe('useWorkspaceStore', () => {
  afterEach(() => {
    useWorkspaceStore.setState({ activeWorkspace: 'map' })
  })

  describe('default state', () => {
    it('activeWorkspace defaults to map', () => {
      expect(useWorkspaceStore.getState().activeWorkspace).toBe('map')
    })
  })

  describe('actions', () => {
    it('setActiveWorkspace sets to flow', () => {
      useWorkspaceStore.getState().setActiveWorkspace('flow')
      expect(useWorkspaceStore.getState().activeWorkspace).toBe('flow')
    })

    it('setActiveWorkspace sets to security', () => {
      useWorkspaceStore.getState().setActiveWorkspace('security')
      expect(useWorkspaceStore.getState().activeWorkspace).toBe('security')
    })

    it('setActiveWorkspace sets to overview', () => {
      useWorkspaceStore.getState().setActiveWorkspace('overview')
      expect(useWorkspaceStore.getState().activeWorkspace).toBe('overview')
    })

    it('allows setting workspace to change', () => {
      useWorkspaceStore.getState().setActiveWorkspace('change')
      expect(useWorkspaceStore.getState().activeWorkspace).toBe('change')
    })

    it('allows setting workspace to activity', () => {
      useWorkspaceStore.getState().setActiveWorkspace('activity')
      expect(useWorkspaceStore.getState().activeWorkspace).toBe('activity')
    })

    it('setActiveWorkspace sets back to map', () => {
      useWorkspaceStore.getState().setActiveWorkspace('flow')
      useWorkspaceStore.getState().setActiveWorkspace('map')
      expect(useWorkspaceStore.getState().activeWorkspace).toBe('map')
    })
  })
})
