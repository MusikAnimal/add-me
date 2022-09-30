/**
 * @class
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

		this.api = new mw.Api();
		this.project = null;
		this.config = {
			// Which page to post the comment to. If null, it uses the current page.
			'page': null,
			// Which section of the page to post the comment to.
			'section-header': null,
			// Maximum level of section to process; used to help prevent putting comments in the wrong
			//   place if there are multiple sections with the same title.
			'max-section-level': null,
			// A template or other wikitext to prepend before the comment, such as a {{support}} template.
			'prepend-template': null,
			// Regular expression used to removed unwanted content from the comment (such as a {{support}} template).
			'remove-content-regex': null,
			// Where to link to when there are (rare) fatal errors with the gadget. Normally should not be overridden.
			// FIXME: this hasn't been implemented yet; idea was to add a "Report" button to showError()
			'error-report-page': 'Meta talk:AddMe',
		};
		this.messages = null;
		this.userLang = mw.config.get( 'wgUserLanguage' );

		this.$buttons.on( 'click', ( e ) => {
			this.project = e.target.dataset.addmeProject;
			if ( !this.project ) {
				return this.log( "Button is missing the 'data-addme-project' attribute." )
			}

			this.config.page = this.config.page || e.target.dataset.addmePage
				|| mw.config.get( 'wgPageName' );

			this.fetchConfig()
				.done( this.showDialog.bind( this ) )
				.fail( this.showError.bind( this ) );
		} );
	}

	/**
	 * Fetch the configuration and set the appropriate class properties.
	 *
	 * @returns {jQuery.<JQueryDeferred>}
	 */
	fetchConfig() {
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

	parseJSON( title, content ) {
		try {
			return JSON.parse( content );
		} catch {
			this.showError(
				`Unable to parse the configuration page [[${title}]]. ` +
				'There may have been a recent change that contains invalid JSON.'
			);
		}
	}

	/**
	 * Show the submission dialog.
	 */
	showDialog() {
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
						return that.submit( this.textarea.getValue(), this.watchCheckbox.isSelected() );
					}
				} );
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
	 * @returns {jQuery.<JQueryDeferred>}
	 */
	submit( comment, watch ) {
		const dfd = $.Deferred();

		// Cleanup the comment.
		comment = comment.replace( '~~~~', '' ).trim();
		if ( this.config['remove-content-regex'] ) {
			comment = comment.replace( new RegExp( this.config['remove-content-regex'] ), '' ).trim();
		}

		if ( this.config['section-header'] ) {
			this.api.get( {
				format: 'json',
				action: 'parse',
				prop: 'sections',
				page: this.config.page,
				// FIXME: may not work if the content language is not 'en'?
				uselang: 'en',
			} ).then( result => {
				const sections = result.parse.sections;
				let sectionCount = 0,
					sectionFound = false;
				debugger;

				sections.forEach( ( section ) => {
					if ( section.level > this.config['max-section-level'] ) {
						return;
					}
					if ( section.anchor === this.config['section-header'] ) {

					}
				} );
				dfd.resolve();
			} ).fail( ( errCode ) => {
				let debugMsg = `The server returned an error when fetching section titles for [[${this.config.page}]].`,
					msg = 'error-save',
					recoverable = true;

				if ( errCode === 'missingtitle' ) {
					debugMsg = `The page [[${this.config.page}]] is missing.`;
					msg = 'error-fatal';
					recoverable = false;
				}

				this.log( debugMsg );
				return dfd.reject(
					new OO.ui.Error( this.messages[msg], { recoverable } )
				);
			} );
		}

		return dfd;
	}

	/**
	 * Show an error to the user using an OOUI alert dialog.
	 *
	 * @param {string} msg
	 */
	showError( msg ) {
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
		mw.log[level]( `[AddMe] ${message}` );
		return message;
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
