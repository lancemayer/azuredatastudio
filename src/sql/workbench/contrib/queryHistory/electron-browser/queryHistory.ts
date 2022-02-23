/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the Source EULA. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IWorkbenchContribution } from 'vs/workbench/common/contributions';
import { IQueryHistoryService } from 'sql/workbench/services/queryHistory/common/queryHistoryService';
import { KeyMod, KeyCode } from 'vs/base/common/keyCodes';
import { localize } from 'vs/nls';
import { SyncActionDescriptor, MenuRegistry, MenuId, registerAction2, Action2 } from 'vs/platform/actions/common/actions';
import { IWorkbenchActionRegistry, Extensions as ActionExtensions } from 'vs/workbench/common/actions';
import { Registry } from 'vs/platform/registry/common/platform';
import { ToggleQueryHistoryAction } from 'sql/workbench/contrib/queryHistory/browser/queryHistoryActions';
import { CommandsRegistry } from 'vs/platform/commands/common/commands';
import { IConfigurationRegistry, ConfigurationScope, Extensions } from 'vs/platform/configuration/common/configurationRegistry';
import { ViewContainer, IViewContainersRegistry, Extensions as ViewContainerExtensions, IViewsRegistry, ViewContainerLocation } from 'vs/workbench/common/views';
import { SyncDescriptor } from 'vs/platform/instantiation/common/descriptors';
import { ViewPaneContainer } from 'vs/workbench/browser/parts/views/viewPaneContainer';
import { QUERY_HISTORY_CONTAINER_ID, QUERY_HISTORY_VIEW_ID } from 'sql/workbench/contrib/queryHistory/common/constants';
import { QueryHistoryView } from 'sql/workbench/contrib/queryHistory/browser/queryHistoryView';
import { ContextKeyEqualsExpr } from 'vs/platform/contextkey/common/contextkey';
import { ServicesAccessor } from 'vs/platform/instantiation/common/instantiation';
import { Codicon } from 'vs/base/common/codicons';

export class QueryHistoryWorkbenchContribution implements IWorkbenchContribution {

	private queryHistoryEnabled: boolean = false;

	constructor(
		@IQueryHistoryService _queryHistoryService: IQueryHistoryService
	) {
		// This feature is in preview so for now hide it behind a flag. We expose this as a command
		// so that the query-history extension can call it. We eventually want to move all this into
		// the extension itself so this should be a temporary workaround
		CommandsRegistry.registerCommand({
			id: 'queryHistory.enableQueryHistory',
			handler: () => {
				// This should never be called more than once, but just in case
				// we don't want to try and register multiple times
				if (!this.queryHistoryEnabled) {
					this.queryHistoryEnabled = true;

					const configurationRegistry = Registry.as<IConfigurationRegistry>(Extensions.Configuration);
					configurationRegistry.registerConfiguration({
						id: 'queryHistory',
						title: localize('queryHistoryConfigurationTitle', "QueryHistory"),
						type: 'object',
						properties: {
							'queryHistory.captureEnabled': {
								type: 'boolean',
								default: true,
								scope: ConfigurationScope.APPLICATION,
								description: localize('queryHistoryCaptureEnabled', "Whether Query History capture is enabled. If false queries executed will not be captured.")
							}
						}
					});

					// We need this to be running in the background even if the Panel (which is currently the only thing using it)
					// isn't shown yet. Otherwise the service won't be initialized until the Panel is which means we might miss out
					// on some events
					_queryHistoryService.start();

					registerAction2(class extends Action2 {
						constructor() {
							super({
								id: `queryHistory.clear`,
								title: { value: localize('queryHistory.clearLabel', "Clear All History"), original: 'Clear All History' },
								icon: Codicon.clearAll,
								menu: {
									id: MenuId.ViewTitle,
									group: 'navigation',
									when: ContextKeyEqualsExpr.create('view', QUERY_HISTORY_VIEW_ID),
									order: 10
								}
							});
						}

						run(accessor: ServicesAccessor) {
							const queryHistoryService = accessor.get(IQueryHistoryService);
							queryHistoryService.clearQueryHistory();
						}
					});

					const PAUSE_QUERY_HISTORY_CAPTURE = localize('queryHistory.disableCapture', "Pause Query History Capture");
					const START_QUERY_HISTORY_CAPTURE = localize('queryHistory.enableCapture', "Start Query History Capture");

					registerAction2(class extends Action2 {
						constructor() {
							super({
								id: `queryHistory.toggleCapture`,
								title: { value: START_QUERY_HISTORY_CAPTURE, original: 'Start Query History Capture' },
								tooltip: START_QUERY_HISTORY_CAPTURE,
								icon: Codicon.play,
								menu: {
									id: MenuId.ViewTitle,
									group: 'navigation',
									when: ContextKeyEqualsExpr.create('view', QUERY_HISTORY_VIEW_ID),
									order: 20
								},
								toggled: {
									condition: ContextKeyEqualsExpr.create('config.queryHistory.captureEnabled', true),
									title: { value: PAUSE_QUERY_HISTORY_CAPTURE, original: 'Pause Query History Capture' },
									tooltip: PAUSE_QUERY_HISTORY_CAPTURE,
									icon: { id: 'debug-pause' }
								}
							});
						}

						run(accessor: ServicesAccessor) {
							const queryHistoryService = accessor.get(IQueryHistoryService);
							queryHistoryService.toggleCaptureEnabled();
						}
					});

					const registry = Registry.as<IWorkbenchActionRegistry>(ActionExtensions.WorkbenchActions);
					registry.registerWorkbenchAction(
						SyncActionDescriptor.create(
							ToggleQueryHistoryAction,
							ToggleQueryHistoryAction.ID,
							ToggleQueryHistoryAction.LABEL,
							{ primary: KeyMod.CtrlCmd | KeyMod.Shift | KeyCode.KEY_T }),
						'View: Toggle Query history',
						localize('viewCategory', "View")
					);

					MenuRegistry.appendMenuItem(MenuId.MenubarViewMenu, {
						group: '4_panels',
						command: {
							id: ToggleQueryHistoryAction.ID,
							title: localize({ key: 'miViewQueryHistory', comment: ['&& denotes a mnemonic'] }, "&&Query History")
						},
						order: 2
					});

					const VIEW_CONTAINER: ViewContainer = Registry.as<IViewContainersRegistry>(ViewContainerExtensions.ViewContainersRegistry).registerViewContainer({
						id: QUERY_HISTORY_CONTAINER_ID,
						title: localize('queryHistory', "Query History"),
						hideIfEmpty: true,
						order: 20,
						ctorDescriptor: new SyncDescriptor(ViewPaneContainer, [QUERY_HISTORY_CONTAINER_ID, { mergeViewWithContainerWhenSingleView: true, donotShowContainerTitleWhenMergedWithContainer: true }]),
						storageId: `${QUERY_HISTORY_CONTAINER_ID}.storage`,
					}, ViewContainerLocation.Panel);

					Registry.as<IViewsRegistry>(ViewContainerExtensions.ViewsRegistry).registerViews([{
						id: QUERY_HISTORY_VIEW_ID,
						name: localize('queryHistory', "Query History"),
						canToggleVisibility: false,
						canMoveView: false,
						ctorDescriptor: new SyncDescriptor(QueryHistoryView),
					}], VIEW_CONTAINER);
				}
			}
		});
	}
}
