'use strict';
'require baseclass';
'require fs';
'require rpc';
'require ui';

document.head.append(E('style', {'type': 'text/css'},
`
.label-status {
	display: inline;
	margin: 0px 2px 0px 0 !important;
	padding: 1px 4px 2px 4px;
	-webkit-border-radius: 3px;
	-moz-border-radius: 3px;
	border-radius: 3px;
	font-weight: bold;
	color: #fff !important;
}
.starting {
	background-color: #a7b668 !important;
}
.running {
	background-color: #2ea256 !important;
}
.updating {
	background-color: #1e82ff !important;
}
.stopped {
	background-color: #acacac !important;
}
.error {
	background-color: #ff4e54 !important;
}
.total-proxy {
	background-color: #ffb937 !important;
}
`));

return baseclass.extend({
	appName          : 'ruantiblock',
	execPath         : '/usr/bin/ruantiblock',
	tokenFile        : '/var/run/ruantiblock.token',
	parsersDir       : '/usr/bin',
	torrcFile        : '/etc/tor/torrc',
	userEntriesFile  : '/etc/ruantiblock/user_entries',
	fqdnFilterFile   : '/etc/ruantiblock/fqdn_filter',
	ipFilterFile     : '/etc/ruantiblock/ip_filter',
	crontabFile      : '/etc/crontabs/root',
	infoLabelStarting: '<span class="label-status starting">' + _('Starting') + '</span>',
	infoLabelRunning : '<span class="label-status running">' + _('Enabled') + '</span>',
	infoLabelUpdating: '<span class="label-status updating">' + _('Updating') + '</span>',
	infoLabelStopped : '<span class="label-status stopped">' + _('Disabled') + '</span>',
	infoLabelError   : '<span class="label-status error">' + _('Error') + '</span>',

	blacklistSources: {
		'rublacklist': 'https://rublacklist.net',
		'zapret-info': 'https://github.com/zapret-info/z-i',
		'antifilter' : 'https://antifilter.download',
	},

	callInitStatus: rpc.declare({
		object: 'luci',
		method: 'getInitList',
		params: [ 'name' ],
		expect: { '': {} }
	}),

	callInitAction: rpc.declare({
		object: 'luci',
		method: 'setInitAction',
		params: [ 'name', 'action' ],
		expect: { result: false }
	}),

	getInitStatus: function(name) {
		return this.callInitStatus(name).then(res => {
			if(res) {
				return res[name].enabled;
			} else {
				throw _('Command failed');
			}
		}).catch(e => {
			ui.addNotification(null,
				E('p', _('Failed to get %s init status: %s').format(name, e)));
		});
	},

	handleServiceAction: function(name, action) {
		return this.callInitAction(name, action).then(success => {
			if(!success) {
				throw _('Command failed');
			};
			return true;
		}).catch(e => {
			ui.addNotification(null,
				E('p', _('Service action failed "%s %s": %s').format(name, action, e)));
		});
	},

	normalizeValue: function(v) {
		return (v && typeof(v) === 'string') ? v.trim().replace(/\r?\n/g, '') : v;
	},

	makeStatusString: function(
								app_status_code,
								proxy_mode,
								bllist_mode,
								bllist_module,
								bllist_source,
								tp_status_code,
								vpn_route_status_code) {
		let app_status_label;
		let spinning = '';

		switch(app_status_code) {
			case 0:
				app_status_label = this.infoLabelRunning;
				break;
			case 2:
				app_status_label = this.infoLabelStopped;
				break;
			case 3:
				app_status_label = this.infoLabelStarting;
				spinning = ' spinning';
				break;
			case 4:
				app_status_label = this.infoLabelUpdating;
				spinning = ' spinning';
				break;
			default:
				app_status_label = this.infoLabelError;
				return `<table class="table">
							<tr class="tr">
								<td class="td left" style="min-width:33%%">
									${_('Status')}:
								</td>
								<td class="td left">
									${app_status_label}
								</td>
							</tr>
						</table>`
		};

		return `<table class="table">
					<tr class="tr">
						<td class="td left" style="min-width:33%%">
							${_('Status')}:
						</td>
						<td class="td left%s">
							%s %s %s
						</td>
					</tr>
					<tr class="tr">
						<td class="td left">
							${_('Proxy mode')}:
						</td>
						<td class="td left">
							%s
						</td>
					</tr>
					<tr class="tr">
						<td class="td left">
							${_('Blacklist update mode')}:
						</td>
						<td class="td left">
							%s
						</td>
					</tr>
					%s
				</table>
		`.format(
			spinning,
			app_status_label,
			(tp_status_code == 0) ? '<span class="label-status total-proxy">'
				+ _('Total-proxy is on') + '</span>' : '',
			(app_status_code != 2 && proxy_mode == 2 && vpn_route_status_code != 0)
				? '<span class="label-status error">'
					+ _('VPN routing error! Need restart') + '</span>' : '',
			(proxy_mode == 1) ? 'Tor' : 'VPN',
			(!bllist_module || bllist_module === '') ? _('user entries only') : bllist_mode,
			(!bllist_module || bllist_module === '') ? '' :
					`<tr class="tr">
						<td class="td left">
							${_('Blacklist source')}:
						</td>
						<td class="td left">
							<span style="cursor:help; border-bottom:1px dotted" data-tooltip="${this.blacklistSources[bllist_source]}">
								${bllist_source}
							</span>
						</td>
					</tr>`
		);
	},

	fileEditDialog: baseclass.extend({
		__init__: function(file, title, description, callback, file_exists=false) {
			this.file        = file;
			this.title       = title;
			this.description = description;
			this.callback    = callback;
			this.file_exists = file_exists;
		},

		load: function() {
			return fs.read(this.file);
		},

		render: function(content) {
			ui.showModal(this.title, [
				E('div', { 'class': 'cbi-section' }, [
					E('div', { 'class': 'cbi-section-descr' }, this.description),
					E('div', { 'class': 'cbi-section' },
						E('p', {},
							E('textarea', {
								'id': 'widget.modal_content',
								'class': 'cbi-input-textarea',
								'style': 'width:100% !important',
								'rows': 10,
								'wrap': 'off',
								'spellcheck': 'false',
							},
							content || '')
						)
					),
				]),
				E('div', { 'class': 'right' }, [
					E('button', {
						'class': 'btn',
						'click': ui.hideModal,
					}, _('Dismiss')),
					' ',
					E('button', {
						'id': 'btn_save',
						'class': 'btn cbi-button-positive important',
						'click': ui.createHandlerFn(this, this.handleSave),
					}, _('Save')),
				]),
			]);
		},

		handleSave: function(ev) {
			let textarea = document.getElementById('widget.modal_content');
			let value    = textarea.value.trim().replace(/\r\n/g, '\n') + '\n';

			return fs.write(this.file, value).then(async rc => {
				textarea.value = value;
				ui.addNotification(null, E('p', _('Contents have been saved.')),
					'info');
				if(this.callback) {
					return this.callback(rc);
				};
			}).catch(e => {
				ui.addNotification(null, E('p', _('Unable to save the contents')
					+ ': %s'.format(e.message)));
			}).finally(() => {
				ui.hideModal();
			});
		},

		error: function(e) {
			if(!this.file_exists && e instanceof Error && e.name === 'NotFoundError') {
				return this.render();
			} else {
				ui.showModal(this.title, [
					E('div', { 'class': 'cbi-section' },
						E('p', {}, _('Unable to read the contents')
							+ ': %s'.format(e.message))
					),
					E('div', { 'class': 'right' },
						E('button', {
							'class': 'btn',
							'click': ui.hideModal,
						}, _('Dismiss'))
					),
				]);
			};
		},

		show: function() {
			ui.showModal(null,
				E('p', { 'class': 'spinning' }, _('Loading'))
			);
			this.load().then(content => {
				ui.hideModal();
				return this.render(content);
			}).catch(e => {
				ui.hideModal();
				return this.error(e);
			})
		},
	}),
});
