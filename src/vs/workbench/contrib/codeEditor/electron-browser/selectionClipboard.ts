/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the Source EULA. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { RunOnceScheduler } from 'vs/base/common/async';
import { Disposable } from 'vs/base/common/lifecycle';
import * as platform from 'vs/base/common/platform';
import { ICodeEditor, IEditorMouseEvent } from 'vs/editor/browser/editorBrowser';
import { registerEditorContribution } from 'vs/editor/browser/editorExtensions';
import { ConfigurationChangedEvent, EditorOption } from 'vs/editor/common/config/editorOptions';
import { ICursorSelectionChangedEvent } from 'vs/editor/common/controller/cursorEvents';
import { Range } from 'vs/editor/common/core/range';
import { IEditorContribution } from 'vs/editor/common/editorCommon';
import { EndOfLinePreference } from 'vs/editor/common/model';
import { IClipboardService } from 'vs/platform/clipboard/common/clipboardService';
import { SelectionClipboardContributionID } from 'vs/workbench/contrib/codeEditor/browser/selectionClipboard';

export class SelectionClipboard extends Disposable implements IEditorContribution {
	private static readonly SELECTION_LENGTH_LIMIT = 65536;

	constructor(editor: ICodeEditor, @IClipboardService clipboardService: IClipboardService) {
		super();

		if (platform.isLinux) {
			let isEnabled = editor.getOption(EditorOption.selectionClipboard);

			this._register(editor.onDidChangeConfiguration((e: ConfigurationChangedEvent) => {
				if (e.hasChanged(EditorOption.selectionClipboard)) {
					isEnabled = editor.getOption(EditorOption.selectionClipboard);
				}
			}));

			this._register(editor.onMouseUp((e: IEditorMouseEvent) => {
				if (!isEnabled) {
					if (e.event.middleButton) {
						// try to stop the upcoming paste
						e.event.preventDefault();
					}
				}
			}));

			let setSelectionToClipboard = this._register(new RunOnceScheduler(() => {
				if (!editor.hasModel()) {
					return;
				}
				let model = editor.getModel();
				let selections = editor.getSelections();
				selections = selections.slice(0);
				selections.sort(Range.compareRangesUsingStarts);

				let resultLength = 0;
				for (const sel of selections) {
					if (sel.isEmpty()) {
						// Only write if all cursors have selection
						return;
					}
					resultLength += model.getValueLengthInRange(sel);
				}

				if (resultLength > SelectionClipboard.SELECTION_LENGTH_LIMIT) {
					// This is a large selection!
					// => do not write it to the selection clipboard
					return;
				}

				let result: string[] = [];
				for (const sel of selections) {
					result.push(model.getValueInRange(sel, EndOfLinePreference.TextDefined));
				}

				let textToCopy = result.join(model.getEOL());
				clipboardService.writeText(textToCopy, 'selection');
			}, 100));

			this._register(editor.onDidChangeCursorSelection((e: ICursorSelectionChangedEvent) => {
				if (!isEnabled) {
					return;
				}
				if (e.source === 'restoreState') {
					// do not set selection to clipboard if this selection change
					// was caused by restoring editors...
					return;
				}
				setSelectionToClipboard.schedule();
			}));
		}
	}

	public dispose(): void {
		super.dispose();
	}
}

registerEditorContribution(SelectionClipboardContributionID, SelectionClipboard);
