import { useState } from 'react';
import {
    ChevronDown, ChevronRight, ShoppingBag, Store,
    Link2, Copy, Check, AlertTriangle
} from 'lucide-react';
import { StagingProduct } from '@/app/actions/staging';

// Re-using types from StagingInterface (we might need to export them later or duplicate for now if in separate file)
// For now, assuming this will be pasted into StagingInterface.tsx or used as a sub-component.
// But wait, if I use write_to_file to a NEW file, I need to export/import.
// The prompted tool was write_to_file, but typically I modify StagingInterface.tsx directly.
// The user context says "Refactor Stock UI". StagingInterface.tsx is already large.
// Creating a separate file components/staging/AccordionRow.tsx is better practice.
// But I need to export types from StagingInterface or move types to a shared file.
// Types are currently in StagingInterface.tsx (and not exported).
// Codebase consistency: keeping it in StagingInterface.tsx for now is safer to avoid circular deps or type moving hassle unless I move types first.

// I will just add it to StagingInterface.tsx using replace_file_content or insert.
// Wait, the tool selection was write_to_file. I should probably use replace_file_content to append/insert.
// Or if I really want to use write_to_file, I must be creating a new file.
// I think putting it in `components/staging/AccordionRow.tsx` is cleaner.
// I will move types to `app/actions/staging.ts` or a `types.ts` file?
// `StagingProduct` is in `app/actions/staging.ts`.
// `ProductGroup`, `MatchedGroup`, `ReconcileItem`, `ReconcileGroup` are local.
// I'll export `ReconcileItem` and `ReconcileGroup` from StagingInterface.tsx? No, it's a component file.
// I'll just put AccordionRow in StagingInterface.tsx for now to minimize friction.
