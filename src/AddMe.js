/**
 * @class
 * @property {jQuery} $content
 * @property {Array.<jQuery>} $buttons References to all the AddMe buttons on the page.
 * @property {mw.Api} api
 * @property {string} project Which key to use when loading the configuration and translations.
 * @property {Array.<Object>} config Config fetched from AddMe.CONFIG_PAGE.
 * @property {string} userLang The user's interface language.
 * @property {Array.<Object>} messages The interface messages.
 */
class AddMe {

	static CONFIG_PAGE = 'User:MusikAnimal/AddMe-config';
	static MESSAGES_PAGE = 'User:MusikAnimal/AddMe-messages';

	/**
	 * @constructor
	 * @param {jQuery} $content The content area as provided by the mediawiki.content hook.
	 */
	constructor( $content ) {
		this.$buttons = $content.find( '.addme-button' );
		if ( !this.$buttons.length ) {
			return;
		}

		this.$content = $content;
		this.debugMode = window.AddMeDebug;
		this.api = new mw.Api();
		this.project = null;
		this.config = {
			// Which page to post the comment to. If null, it uses the current page.
			'page': null,
			// The anchor of the section of the page to post the comment to.
			'section-anchor': null,
			// Maximum level of section to process; used to help prevent putting comments in the wrong
			//   place if there are multiple sections with the same title.
			'max-section-level': null,
			// Wikitext to prepend before the comment, such as a {{support}} template.
			'prepend-content': '',
			// Regular expression used to removed unwanted content from the comment (such as a {{support}} template).
			'remove-content-regex': null,
			// Edit summary to use.
			'edit-summary': '',
			// Where to link to when there are unrecoverable errors with the gadget or its configuration.
			// FIXME: this hasn't been implemented yet; idea was to add a "Report" button to showError()
			'error-report-page': 'Meta talk:AddMe',
		};
		this.messages = null;
		this.userLang = mw.config.get( 'wgUserLanguage' );

		this.$buttons.on( 'click', ( e ) => {
			this.project = e.target.dataset.addmeProject;
			if ( !this.project ) {
				return this.showAlert(
					this.log( "Button is missing the 'data-addme-project' attribute." )
				);
			}

			this.config.page = this.config.page || e.target.dataset.addmePage
				|| mw.config.get( 'wgPageName' );

			this.fetchConfig()
				.then( this.showDialog.bind( this ) )
				.fail( this.showAlert.bind( this ) );
		} );
	}

	/**
	 * Fetch the configuration and set the appropriate class properties.
	 *
	 * @returns {JQueryDeferred}
	 */
	fetchConfig() {
		this.debug('fetchConsole()');
		const dfd = $.Deferred();

		if ( this.messages && this.config.page ) {
			// Everything is already loaded.
			return dfd.resolve();
		}

		const langPageEn = `${AddMe.MESSAGES_PAGE}/en`,
			langPageLocal = `${AddMe.MESSAGES_PAGE}/${this.userLang}`;
		let titles = [
			AddMe.CONFIG_PAGE,
			// Always pull in the English so that we have fallbacks for each message. Payloads are small.
			langPageEn,
		];
		if ( this.userLang !== 'en' ) {
			// Fetch the translation in the user's language, if not English.
			titles.push( langPageLocal );
		}

		this.api.get( {
			action: 'query',
			prop: 'revisions',
			titles,
			rvprop: 'content',
			rvslots: 'main',
			format: 'json',
			formatversion: 2,
		} ).then( ( resp ) => {
			this.debug('fetchConsole then()');
			let messagesLocal = {},
				messagesEn = {};

			resp.query.pages.forEach( page => {
				if ( page.missing ) {
					switch (page.title) {
						case AddMe.CONFIG_PAGE:
							dfd.reject(
								this.log(`Missing configuration page [[${AddMe.CONFIG_PAGE}]]`)
							)
							break;
						case langPageEn:
							dfd.reject(
								this.log(`Missing base language page [[${langPageEn}]]`)
							);
							break;
						case langPageLocal:
							this.log(`Localization for '${this.userLang}' missing at [[${langPageLocal}]]`, 'warn');
							break;
					}
				} else {
					const pageObj = page.revisions[0].slots.main;
					if ( pageObj.contentmodel === 'json' ) {
						// We know it's the config page.
						this.config = Object.assign(
							this.config,
							this.parseJSON( page.title, pageObj.content )[this.project]
						);
					} else if ( page.title === langPageLocal && this.userLang !== 'en' ) {
						messagesLocal = this.parseJSON( page.title, pageObj.content ).messages[this.project];
					} else {
						messagesEn = this.parseJSON( page.title, pageObj.content ).messages[this.project];
					}
				}
			} );

			this.messages = Object.assign( {}, messagesEn, messagesLocal );
			dfd.resolve();
		} );

		return dfd;
	}

	/**
	 * The content model of the messages page is wikitext so that it can be used with Extension:Translate.
	 * Consequently, it's easy to break things. This just does a try/catch and indicates the likely culprit.
	 *
	 * @param title
	 * @param content
	 * @return {object}
	 */
	parseJSON( title, content ) {
		try {
			return JSON.parse( content );
		} catch {
			this.showAlert(
				`Unable to parse the configuration page [[${title}]]. ` +
				'There may have been a recent change that contains invalid JSON.'
			);
		}
	}

	/**
	 * Show the submission dialog.
	 */
	showDialog() {
		this.debug('showDialog()');
		const that = this;
		const Dialog = function() {
			Dialog.super.call( this, { size: 'medium' } );
		};
		OO.inheritClass( Dialog, OO.ui.ProcessDialog );
		Dialog.static.name = 'add-me';
		Dialog.static.title = that.msg( 'title' );
		Dialog.static.actions = [
			{ action: 'submit', label: that.msg( 'submit' ), flags: [ 'primary', 'progressive' ] },
			{ label: that.msg( 'cancel' ), flags: 'safe' },
		];
		Dialog.prototype.initialize = function () {
			Dialog.super.prototype.initialize.apply( this, arguments );
			this.editFieldset = new OO.ui.FieldsetLayout();
			this.content = new OO.ui.PanelLayout( { padded: true, expanded: false } );
			this.content.$element.append( this.editFieldset.$element );
			this.textarea = new OO.ui.MultilineTextInputWidget( {
				placeholder: that.msg( 'placeholder-comment' ),
			} );
			this.watchCheckbox = new OO.ui.CheckboxInputWidget( { selected: false } );
			const formElements = [
				new OO.ui.FieldLayout( this.textarea, {
					label: that.msg( 'description' ),
					align: 'top',
				} ),
				new OO.ui.FieldLayout( this.watchCheckbox, {
					label: that.msg( 'watch-page' ),
					align: 'inline',
				} ),
			];
			this.editFieldset.addItems( formElements );
			this.content.$element.append(
				$( `<p>${that.msg( 'signature' )}</p>` )
			);
			this.$body.append( this.content.$element );
		};
		Dialog.prototype.getActionProcess = function ( action ) {
			return Dialog.super.prototype.getActionProcess.call( this, action )
				.next( () => {
					if ( action === 'submit' ) {
						that.debug('submitting form...');
						return that.submit( this.textarea.getValue(), this.watchCheckbox.isSelected() );
					}

					return Dialog.super.prototype.getActionProcess( this, action );
				} )
				.next( () => this.close );
		};

		// Create and append a window manager, which opens and closes the dialog.
		const windowManager = new OO.ui.WindowManager();
		$( document.body ).append( windowManager.$element );

		// Instantiate and show the dialog.
		const addMeDialog = new Dialog();
		windowManager.addWindows( [ addMeDialog ] );
		windowManager.openWindow( addMeDialog );
	}

	/**
	 * Submit the comment and watch status to the page.
	 *
	 * @param {string} comment
	 * @param {boolean} watch
	 * @returns {JQueryDeferred}
	 */
	submit( comment, watch ) {
		this.debug('submit()');
		const dfd = $.Deferred();

		// Cleanup the comment.
		comment = comment.replace( '~~~~', '' );
		if ( this.config['remove-content-regex'] ) {
			comment = comment.replace( new RegExp( this.config['remove-content-regex'] ), '' );
		}
		comment = `\n${this.config['prepend-content']}${comment.trim()} ~~~~`;

		this.findSection()
			.then( this.updateSection.bind( this, comment, watch ) )
			.catch( ( message ) => {
				if ( message.constructor.name === 'OoUiError' ) {
					message = message.message;
				}
				dfd.reject( new OO.ui.Error( message || this.messages['error-save'] ) );
			} )
			.then( () => {
				this.reloadContent();
				dfd.resolve();
			} );

		return dfd;
	}

	/**
	 * Reload the content on the page with the newly added comment.
	 * Some of this was copied from Extension:DiscussionTools / controller.js
	 *
	 * @return {jQuery.Promise}
	 */
	reloadContent() {
		return this.api.get( {
			action: 'parse',
			// HACK: we need 'useskin' so that reply links show (T266195)
			useskin: mw.config.get( 'skin' ),
			mobileformat: OO.ui.isMobile(),
			uselang: mw.config.get( 'wgUserLanguage' ),
			prop: [ 'text', 'revid' ],
			page: mw.config.get( 'wgRelevantPageName' ),
			formatversion: 2,
		} ).then( ( data ) => {
			debugger;
			// Actually replace the content.
			this.$content.find( '.mw-parser-output' )
				.first()
				.replaceWith( data.parse.text );

			// Update revision ID for other gadgets that rely on it being accurate.
			mw.config.set( {
				wgCurRevisionId: data.parse.revid,
				wgRevisionId: data.parse.revid
			} );

			// eslint-disable-next-line no-jquery/no-global-selector
			$( '#t-permalink a, #coll-download-as-rl a' ).each( function () {
				var url = new URL( this.href );
				url.searchParams.set( 'oldid', data.parse.revid );
				$( this ).attr( 'href', url.toString() );
			} );

			mw.hook( 'wikipage.content' ).fire( this.$content );
		} );
	}

	/**
	 * Add the comment to the given section.
	 *
	 * @param {string} comment
	 * @param {boolean} watch
	 * @param {Object} section
	 * @param {string} timestamp
	 * @return {JQuery.Promise}
	 */
	updateSection( comment, watch, section, timestamp ) {
		this.debug('updateSection()');

		return this.api.postWithEditToken( {
			action: 'edit',
			title: this.config.page,
			section: section.number,
			summary: this.config['edit-summary'],
			starttimestamp: timestamp,
			nocreate: true,
			watchlist: watch ? 'watch' : 'nochange',
			appendtext: comment,
		} );
	}

	/**
	 * Fetch section headers from this.page, and locate the one we're trying to edit.
	 * If no section header constraint is configured, we assume the final section.
	 * If a section header is configured but not found, an error is shown to the user.
	 *
	 * @return {JQueryDeferred.<Object,string>} Deferred promise resolving with section object
	 *   and the current server timestamp.
	 */
	findSection() {
		this.debug('findSelection()');
		const dfd = $.Deferred();

		this.api.get( {
			format: 'json',
			formatversion: 2,
			action: 'parse',
			prop: 'sections',
			page: this.config.page,
			curtimestamp: true,
			// FIXME: may not work if the source language page is not '/en'?
			uselang: 'en',
		} ).done( ( result ) => {
			const sections = result.parse.sections;
			// Locate the section we're trying to edit.
			let section;
			if ( this.config['section-anchor'] ) {
				section = sections.find( ( section ) => {
					const withinMaxLevel = this.config['max-section-level'] ?
						section.toclevel <= this.config['max-section-level'] :
						true;
					return section.anchor === this.config['section-anchor'] && withinMaxLevel
				});

				if ( section ) {
					return dfd.resolve( section, result.curtimestamp );
				}

				this.debug('Section not found');
				dfd.reject(
					new OO.ui.Error(
						`The "${this.config['section-anchor']}" section is missing from [[${this.config.page}]]. ` +
						`Please correct this error or report this issue at [[${this.config['error-report-page']}]].`,
						{ recoverable: false }
					)
				);
			} else {
				// If no section was configured, fallback to using the last section.
				section = sections.at( -1 );
			}

			dfd.resolve( section, result.curtimestamp );
		} ).catch( ( response ) => {
			let logMsg = `There was an error when fetching section titles for [[${this.config.page}]]`,
				msg = 'error-save',
				recoverable = true;

			if ( response === 'missingtitle' ) {
				logMsg = `The page [[${this.config.page}]] is missing.`;
				msg = 'error-fatal';
				recoverable = false;
			}

			this.log( logMsg );
			dfd.reject(
				new OO.ui.Error( this.messages[msg], { recoverable } )
			);
		} );

		return dfd;
	}

	/**
	 * Show an error to the user using an OOUI alert dialog.
	 *
	 * @param {string|OO.ui.Error} msg
	 */
	showAlert( msg ) {
		OO.ui.alert(
			`There was an error with the AddMe gadget: ${msg}\nPlease report this issue at [[${this.config["error-report-page"]}]].`,
			{ title: 'Something went wrong' }
		);
	}

	/**
	 * Log an error to the console.
	 *
	 * @param {string} message
	 * @param {string} level One of: 'info', 'warn', 'error' (default)
	 * @return {string} The given message.
	 */
	log( message, level = 'error' ) {
		if ( level === 'debug' && !this.debugMode ) {
			return message;
		}
		console[level]( `[AddMe] ${message}` );
		return message;
	}

	/**
	 * Log a debug message to the console.
	 * This relies on this.debugMode being set.
	 *
	 * @param {string} message
	 * @return {string} The given message.
	 */
	debug( message ) {
		return this.log( message, 'debug' );
	}

	/**
	 * Shorthand to fetch a message.
	 *
	 * @param {string} key
	 * @return {string}
	 */
	msg( key ) {
		return this.messages[key];
	}
}

/**
 * Entry point, called after the 'wikipage.content' hook is fired.
 *
 * @param {jQuery} $content
 */
function init( $content ) {
	Promise.all( [
		// Resource loader modules
		mw.loader.using( [ 'oojs-ui', 'mediawiki.util', 'mediawiki.api', 'mediawiki.Title' ] ),
		// Page ready
		$.ready
	]).then( () => {
		new AddMe( $content );
	});
}

mw.hook( 'wikipage.content' ).add( init );
