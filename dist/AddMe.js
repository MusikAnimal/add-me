(function(){function r(e,n,t){function o(i,f){if(!n[i]){if(!e[i]){var c="function"==typeof require&&require;if(!f&&c)return c(i,!0);if(u)return u(i,!0);var a=new Error("Cannot find module '"+i+"'");throw a.code="MODULE_NOT_FOUND",a}var p=n[i]={exports:{}};e[i][0].call(p.exports,function(r){var n=e[i][1][r];return o(n||r)},p,p.exports,r,e,n,t)}return n[i].exports}for(var u="function"==typeof require&&require,i=0;i<t.length;i++)o(t[i]);return o}return r})()({1:[function(require,module,exports){
"use strict";

function _classCallCheck(instance, Constructor) { if (!(instance instanceof Constructor)) { throw new TypeError("Cannot call a class as a function"); } }

function _defineProperties(target, props) { for (var i = 0; i < props.length; i++) { var descriptor = props[i]; descriptor.enumerable = descriptor.enumerable || false; descriptor.configurable = true; if ("value" in descriptor) descriptor.writable = true; Object.defineProperty(target, descriptor.key, descriptor); } }

function _createClass(Constructor, protoProps, staticProps) { if (protoProps) _defineProperties(Constructor.prototype, protoProps); if (staticProps) _defineProperties(Constructor, staticProps); return Constructor; }

function _defineProperty(obj, key, value) { if (key in obj) { Object.defineProperty(obj, key, { value: value, enumerable: true, configurable: true, writable: true }); } else { obj[key] = value; } return obj; }

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
var AddMe = /*#__PURE__*/function () {
  /**
   * @constructor
   * @param {jQuery} $content The content area as provided by the mediawiki.content hook.
   */
  function AddMe($content) {
    var _this = this;

    _classCallCheck(this, AddMe);

    this.$buttons = $content.find('.addme-button');

    if (!this.$buttons.length) {
      return;
    }

    this.$content = $content;
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
      'error-report-page': 'Meta talk:AddMe'
    };
    this.messages = null;
    this.userLang = mw.config.get('wgUserLanguage');
    this.$buttons.on('click', function (e) {
      _this.project = e.target.dataset.addmeProject;

      if (!_this.project) {
        return _this.showAlert(_this.log("Button is missing the 'data-addme-project' attribute."));
      }

      _this.config.page = _this.config.page || e.target.dataset.addmePage || mw.config.get('wgPageName');

      _this.fetchConfig().then(_this.showDialog.bind(_this)).fail(_this.showAlert.bind(_this)); // Lazy-load postEdit module (only shown on desktop).


      if (!OO.ui.isMobile()) {
        mw.loader.using('mediawiki.action.view.postEdit');
      }
    });
  }
  /**
   * Fetch the configuration and set the appropriate class properties.
   *
   * @returns {JQueryDeferred}
   */


  _createClass(AddMe, [{
    key: "fetchConfig",
    value: function fetchConfig() {
      var _this2 = this;

      var dfd = $.Deferred();

      if (this.messages && this.config.page) {
        // Everything is already loaded.
        return dfd.resolve();
      }

      var langPageEn = "".concat(AddMe.MESSAGES_PAGE, "/en"),
          langPageLocal = "".concat(AddMe.MESSAGES_PAGE, "/").concat(this.userLang);
      var titles = [AddMe.CONFIG_PAGE, // Always pull in the English so that we have fallbacks for each message. Payloads are small.
      langPageEn];

      if (this.userLang !== 'en') {
        // Fetch the translation in the user's language, if not English.
        titles.push(langPageLocal);
      }

      this.api.get({
        action: 'query',
        prop: 'revisions',
        titles: titles,
        rvprop: 'content',
        rvslots: 'main',
        format: 'json',
        formatversion: 2
      }).then(function (resp) {
        var messagesLocal = {},
            messagesEn = {};
        resp.query.pages.forEach(function (page) {
          if (page.missing) {
            switch (page.title) {
              case AddMe.CONFIG_PAGE:
                dfd.reject(_this2.log("Missing configuration page [[".concat(AddMe.CONFIG_PAGE, "]]")));
                break;

              case langPageEn:
                dfd.reject(_this2.log("Missing base language page [[".concat(langPageEn, "]]")));
                break;

              case langPageLocal:
                _this2.log("Localization for '".concat(_this2.userLang, "' missing at [[").concat(langPageLocal, "]]"), 'warn');

                break;
            }
          } else {
            var pageObj = page.revisions[0].slots.main;

            if (pageObj.contentmodel === 'json') {
              // We know it's the config page.
              _this2.config = Object.assign(_this2.config, _this2.parseJSON(page.title, pageObj.content)[_this2.project]);
            } else if (page.title === langPageLocal && _this2.userLang !== 'en') {
              messagesLocal = _this2.parseJSON(page.title, pageObj.content).messages[_this2.project];
            } else {
              messagesEn = _this2.parseJSON(page.title, pageObj.content).messages[_this2.project];
            }
          }
        });
        _this2.messages = Object.assign({}, messagesEn, messagesLocal);
        dfd.resolve();
      });
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

  }, {
    key: "parseJSON",
    value: function parseJSON(title, content) {
      try {
        return JSON.parse(content);
      } catch (_unused) {
        this.showAlert("Unable to parse the configuration page [[".concat(title, "]]. ") + 'There may have been a recent change that contains invalid JSON.');
      }
    }
    /**
     * Show the submission dialog.
     */

  }, {
    key: "showDialog",
    value: function showDialog() {
      var that = this;

      var Dialog = function Dialog() {
        Dialog["super"].call(this, {
          size: 'medium'
        });
      };

      OO.inheritClass(Dialog, OO.ui.ProcessDialog);
      Dialog["static"].name = 'add-me';
      Dialog["static"].title = that.msg('title');
      Dialog["static"].actions = [{
        action: 'submit',
        label: that.msg('submit'),
        flags: ['primary', 'progressive']
      }, {
        label: that.msg('cancel'),
        flags: 'safe'
      }];

      Dialog.prototype.initialize = function () {
        Dialog["super"].prototype.initialize.apply(this, arguments);
        this.editFieldset = new OO.ui.FieldsetLayout();
        this.content = new OO.ui.PanelLayout({
          padded: true,
          expanded: false
        });
        this.content.$element.append(this.editFieldset.$element);
        this.textarea = new OO.ui.MultilineTextInputWidget({
          placeholder: that.msg('placeholder-comment')
        });
        this.watchCheckbox = new OO.ui.CheckboxInputWidget({
          selected: false
        });
        var formElements = [new OO.ui.FieldLayout(this.textarea, {
          label: that.msg('description'),
          align: 'top'
        }), new OO.ui.FieldLayout(this.watchCheckbox, {
          label: that.msg('watch-page'),
          align: 'inline'
        })];
        this.editFieldset.addItems(formElements);
        this.content.$element.append($("<p>".concat(that.msg('signature'), "</p>")));
        this.$body.append(this.content.$element);
      };

      Dialog.prototype.getActionProcess = function (action) {
        var _this3 = this;

        return Dialog["super"].prototype.getActionProcess.call(this, action).next(function () {
          if (action === 'submit') {
            that.debug('submitting form...');
            return that.submit(_this3.textarea.getValue(), _this3.watchCheckbox.isSelected());
          }

          return Dialog["super"].prototype.getActionProcess(_this3, action);
        }) // FIXME: the promise from submit() is being returned in the above next(),
        //   yet the block below that calls reloadContent() still gets called too early?
        .next(function () {
          return 500;
        }).next(function () {
          if (action === 'submit') {
            that.reloadContent().then(function () {
              return _this3.close();
            });
          } else {
            _this3.close();
          }

          return Dialog["super"].prototype.getActionProcess(_this3, action);
        });
      }; // Create and append a window manager, which opens and closes the dialog.


      var windowManager = new OO.ui.WindowManager();
      $(document.body).append(windowManager.$element); // Instantiate and show the dialog.

      var addMeDialog = new Dialog();
      windowManager.addWindows([addMeDialog]);
      windowManager.openWindow(addMeDialog);
    }
    /**
     * Submit the comment and watch status to the page.
     *
     * @param {string} comment
     * @param {boolean} watch
     * @returns {JQueryDeferred}
     */

  }, {
    key: "submit",
    value: function submit(comment, watch) {
      var _this4 = this;

      var dfd = $.Deferred(); // Cleanup the comment.

      comment = comment.replace('~~~~', '');

      if (this.config['remove-content-regex']) {
        comment = comment.replace(new RegExp(this.config['remove-content-regex']), '');
      }

      comment = "\n".concat(this.config['prepend-content']).concat(comment.trim(), " ~~~~");
      this.findSection().then(this.updateSection.bind(this, comment, watch))["catch"](function (message) {
        if (message.constructor.name === 'OoUiError') {
          message = message.message;
        }

        dfd.reject(new OO.ui.Error(message || _this4.messages['error-save']));
      }).then(dfd.resolve);
      return dfd;
    }
    /**
     * Reload the content on the page with the newly added comment.
     * Some of this was copied from Extension:DiscussionTools / controller.js
     *
     * @fixme This seems probably too heavy an operation for the end of the Wishlist Survey
     *   which can have up to 50+ large subpages transcluded on the same page.
     * @return {jQuery.Promise}
     */

  }, {
    key: "reloadContent",
    value: function reloadContent() {
      var _this5 = this;

      return this.api.get({
        action: 'parse',
        // HACK: we need 'useskin' so that reply links show (T266195)
        useskin: mw.config.get('skin'),
        mobileformat: OO.ui.isMobile(),
        uselang: mw.config.get('wgUserLanguage'),
        prop: ['text', 'revid'],
        page: mw.config.get('wgRelevantPageName'),
        formatversion: 2
      }).then(function (data) {
        // Actually replace the content.
        _this5.$content.find('.mw-parser-output').first().replaceWith(data.parse.text); // Update revision ID for other gadgets that rely on it being accurate.


        mw.config.set({
          wgCurRevisionId: data.parse.revid,
          wgRevisionId: data.parse.revid
        }); // eslint-disable-next-line no-jquery/no-global-selector

        $('#t-permalink a, #coll-download-as-rl a').each(function () {
          var url = new URL(this.href);
          url.searchParams.set('oldid', data.parse.revid);
          $(this).attr('href', url.toString());
        });
        mw.hook('wikipage.content').fire(_this5.$content);

        if (OO.ui.isMobile()) {
          mw.notify(_this5.messages.feedback);
        } else {
          // postEdit is currently desktop only
          mw.hook('postEdit').fire({
            message: _this5.messages.feedback
          });
        }
      }).fail(function () {
        // Comment was saved, but reloading failed. Redirect user to the (sub)page instead.
        window.location = mw.util.getUrl(_this5.page);
      });
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

  }, {
    key: "updateSection",
    value: function updateSection(comment, watch, section, timestamp) {
      return this.api.postWithEditToken({
        action: 'edit',
        title: this.config.page,
        section: section.number,
        summary: this.config['edit-summary'],
        starttimestamp: timestamp,
        nocreate: true,
        watchlist: watch ? 'watch' : 'nochange',
        appendtext: comment
      });
    }
    /**
     * Fetch section headers from this.page, and locate the one we're trying to edit.
     * If no section header constraint is configured, we assume the final section.
     * If a section header is configured but not found, an error is shown to the user.
     *
     * @return {JQueryDeferred.<Object,string>} Deferred promise resolving with section object
     *   and the current server timestamp.
     */

  }, {
    key: "findSection",
    value: function findSection() {
      var _this6 = this;

      var dfd = $.Deferred();
      this.api.get({
        format: 'json',
        formatversion: 2,
        action: 'parse',
        prop: 'sections',
        page: this.config.page,
        curtimestamp: true,
        // FIXME: may not work if the source language page is not '/en'?
        uselang: 'en'
      }).done(function (result) {
        var sections = result.parse.sections; // Locate the section we're trying to edit.

        var section;

        if (_this6.config['section-anchor']) {
          section = sections.find(function (section) {
            var withinMaxLevel = _this6.config['max-section-level'] ? section.toclevel <= _this6.config['max-section-level'] : true;
            return section.anchor === _this6.config['section-anchor'] && withinMaxLevel;
          });

          if (section) {
            return dfd.resolve(section, result.curtimestamp);
          }

          dfd.reject(new OO.ui.Error("The \"".concat(_this6.config['section-anchor'], "\" section is missing from [[").concat(_this6.config.page, "]]. ") + "Please correct this error or report this issue at [[".concat(_this6.config['error-report-page'], "]]."), {
            recoverable: false
          }));
        } else {
          // If no section was configured, fallback to using the last section.
          section = sections.at(-1);
        }

        dfd.resolve(section, result.curtimestamp);
      })["catch"](function (response) {
        var logMsg = "There was an error when fetching section titles for [[".concat(_this6.config.page, "]]"),
            msg = 'error-save',
            recoverable = true;

        if (response === 'missingtitle') {
          logMsg = "The page [[".concat(_this6.config.page, "]] is missing.");
          msg = 'error-fatal';
          recoverable = false;
        }

        _this6.log(logMsg);

        dfd.reject(new OO.ui.Error(_this6.messages[msg], {
          recoverable: recoverable
        }));
      });
      return dfd;
    }
    /**
     * Show an error to the user using an OOUI alert dialog.
     *
     * @param {string|OO.ui.Error} msg
     */

  }, {
    key: "showAlert",
    value: function showAlert(msg) {
      OO.ui.alert("There was an error with the AddMe gadget: ".concat(msg, "\nPlease report this issue at [[").concat(this.config["error-report-page"], "]]."), {
        title: 'Something went wrong'
      });
    }
    /**
     * Log an error to the console.
     *
     * @param {string} message
     * @param {string} level One of: 'info', 'warn', 'error' (default)
     * @return {string} The given message.
     */

  }, {
    key: "log",
    value: function log(message) {
      var level = arguments.length > 1 && arguments[1] !== undefined ? arguments[1] : 'error';
      console[level]("[AddMe] ".concat(message));
      return message;
    }
    /**
     * Shorthand to fetch a message.
     *
     * @param {string} key
     * @return {string}
     */

  }, {
    key: "msg",
    value: function msg(key) {
      return this.messages[key];
    }
  }]);

  return AddMe;
}();
/**
 * Entry point, called after the 'wikipage.content' hook is fired.
 *
 * @param {jQuery} $content
 */


_defineProperty(AddMe, "CONFIG_PAGE", 'User:MusikAnimal/AddMe-config');

_defineProperty(AddMe, "MESSAGES_PAGE", 'User:MusikAnimal/AddMe-messages');

function init($content) {
  Promise.all([// Resource loader modules
  mw.loader.using(['oojs-ui', 'mediawiki.util', 'mediawiki.api', 'mediawiki.Title']), // Page ready
  $.ready]).then(function () {
    new AddMe($content);
  });
}

mw.hook('wikipage.content').add(init);

},{}]},{},[1]);
