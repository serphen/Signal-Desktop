// Copyright 2019 Signal Messenger, LLC
// SPDX-License-Identifier: AGPL-3.0-only

export function cleanId(id: string): string {
  return id.replace(/[^\u0020-\u007e\u00a0-\u00ff]/g, '_');
}

export enum WidthBreakpoint {
  Wide = 'wide',
  Medium = 'medium',
  Narrow = 'narrow',
}

export function getNavSidebarWidthBreakpoint(width: number): WidthBreakpoint {
  return WidthBreakpoint.Wide; // Midnight: never switch to compact icon-only mode
}
