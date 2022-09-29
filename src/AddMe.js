/**
 * @class
 * @property {Array.<jQuery>} $buttons References to all the AddMe buttons on the page.
 * @property {mw.Api} api
 * @property {string} project Which key to use when loading the configuration and translations.
 * @property {Array.<Object>} config Config fetched from AddMe.CONFIG_PAGE, keyed by project.
 * @property {string} userLang The user's interface language.
 * @property {Array.<Object>} messages The interface messages, keyed by project.
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
			// Which page to post the comment to.
			'page': null,
			// Which section of the page to post the comment to.
			'section-header': null,
		};
		this.userLang = mw.config.get( 'wgUserLanguage' );
		this.messages = {};

		this.$buttons.on( 'click', ( e ) => {
			this.project = e.target.dataset.addmeProject;

			if ( !this.project ) {
				return this.log( "Button is missing the 'data-addme-project' attribute." )
			}

			this.fetchConfig()
				.then( this.showDialog )
				.fail( this.showError )
		} );
	}

	/**
	 * Fetch the configuration and set the appropriate class properties.
	 *
	 * @returns {jQuery.<JQueryDeferred>|Promise}
	 */
	fetchConfig() {
		const dfd = $.Deferred();

		if ( this.messages[this.project] && this.config[this.project] ) {
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
						this.config = Object.assign( this.config, JSON.parse( pageObj.content ).default );
					} else if ( page.title === langPageLocal && this.userLang !== 'en' ) {
						// FIXME: replace 'default' with name of project page (and above)
						//  I guess it could be specified as a data-attr on the button.
						messagesLocal = JSON.parse( pageObj.content ).messages;
					} else {
						messagesEn = JSON.parse( pageObj.content).messages;
					}
				}
			} );

			this.messages = Object.assign( messagesEn, messagesLocal );
		} );

		return dfd;
	}

	showDialog() {

	}

	/**
	 * Show an error to the user using an OOUI alert dialog.
	 *
	 * @param {string} msg
	 */
	showError( msg ) {
		OO.ui.alert( `There was an error with the AddMe gadget:\n${msg}` );
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
}

/**
 * Entry point, called after the 'wikipage.content' hook is fired.
 *
 * @param {jQuery} $content
 */
function init( $content ) {
	Promise.all( [
		// Resource loader modules
		mw.loader.using( [ 'mediawiki.util', 'mediawiki.api', 'mediawiki.Title' ] ),
		// Page ready
		$.ready
	]).then( () => {
		new AddMe( $content );
	});
}

mw.hook( 'wikipage.content' ).add( init );
