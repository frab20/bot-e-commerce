"use strict";

const EventEmitter = require("events");
const puppeteer = require("puppeteer");

const Util = require("./util/Util");
const { WhatsWebURL, DefaultOptions, Events } = require("./util/Constants");

class Client extends EventEmitter {
  constructor(options = {}) {
    super();

    this.options = Util.mergeDefault(DefaultOptions, options);

    this.authStrategy = this.options.authStrategy;

    this.authStrategy.setup(this);

    this.pupBrowser = null;
    this.pupPage = null;
  }

  async initialize() {
    let [browser, page] = [null, null];

    await this.authStrategy.beforeBrowserInitialized();

    const puppeteerOpts = this.options.puppeteer;
    if (puppeteerOpts && puppeteerOpts.browserWSEndpoint) {
      browser = await puppeteer.connect(puppeteerOpts);
      page = await browser.newPage();
    } else {
      const browserArgs = [...(puppeteerOpts.args || [])];
      if (!browserArgs.find((arg) => arg.includes("--user-agent"))) {
        browserArgs.push(`--user-agent=${this.options.userAgent}`);
      }

      browser = await puppeteer.launch({ ...puppeteerOpts, args: browserArgs });
      page = (await browser.pages())[0];
    }

    await page.setUserAgent(this.options.userAgent);
    if (this.options.bypassCSP) await page.setBypassCSP(true);

    this.pupBrowser = browser;
    this.pupPage = page;

    await this.authStrategy.afterBrowserInitialized();

    await page.goto(WhatsWebURL, {
      waitUntil: "load",
      timeout: 0,
      referer: "https://shopee.co.id/",
    });

    await page.evaluate(`function getElementByXpath(path) {
      return document.evaluate(path, document, null, XPathResult.FIRST_ORDERED_NODE_TYPE, null).singleNodeValue;
    }`);

    const INTRO_IMG_SELECTOR =
      "#main > div > div.vtexOX > div > div > div > div > svg, #main > div > div.vtexOX > div > div > div > div > div.bK3CzO";
    const INTRO_QRCODE_SELECTOR =
      "#main > div > div.vtexOX > div > div > div > div:nth-child(2) > div > div > div.yXry6s > div > div.n1cnI- > div";

    // Checks which selector appears first
    const needAuthentication = await Promise.race([
      new Promise((resolve) => {
        page
          .waitForSelector(INTRO_IMG_SELECTOR, {
            timeout: this.options.authTimeoutMs,
          })
          .then(() => resolve(false))
          .catch((err) => resolve(err));
      }),
      new Promise((resolve) => {
        page
          .waitForSelector(INTRO_QRCODE_SELECTOR, {
            timeout: this.options.authTimeoutMs,
          })
          .then(() => resolve(true))
          .catch((err) => resolve(err));
      }),
    ]);

    // Checks if an error occurred on the first found selector. The second will be discarded and ignored by .race;
    if (needAuthentication instanceof Error) throw needAuthentication;

    // Scan-qrcode selector was found. Needs authentication
    if (needAuthentication) {
      const { failed, failureEventPayload } =
        await this.authStrategy.onAuthenticationNeeded();

      if (failed) {
        /**
         * Emitted when there has been an error while trying to restore an existing session
         * @event Client#auth_failure
         * @param {string} message
         */
        this.emit(Events.AUTHENTICATION_FAILURE, failureEventPayload);
        await this.destroy();
        return;
      }

      const QR_CONTAINER =
        "#main > div > div.vtexOX > div > div > div > div:nth-child(2) > div > div > div.yXry6s > div > div.n1cnI- > div > div";
      const QR_RETRY_BUTTON =
        "#main > div > div.vtexOX > div > div > div > div:nth-child(2) > div > div > div.yXry6s > div > div.n1cnI- > button";
      let qrRetries = 0;
      await page.exposeFunction("qrChanged", async (qr) => {
        /**
         * Emitted when a QR code is received
         * @event Client#qr
         * @param {string} qr QR Code
         */
        this.emit(Events.QR_RECEIVED, qr);
        if (this.options.qrMaxRetries > 0) {
          qrRetries++;
          if (qrRetries > this.options.qrMaxRetries) {
            this.emit(Events.DISCONNECTED, "Max qrcode retries reached");
            await this.destroy();
          }
        }
      });

      await page.evaluate(
        function (selectors) {
          const qr_container = document.querySelector(selectors.QR_CONTAINER);
          this.computedStyle = window
            .getComputedStyle(qr_container)
            .backgroundImage.match(/url\("(.*)"/)[1];

          window.qrChanged(this.computedStyle);

          const obs = new MutationObserver((muts) => {
            muts.forEach((mut) => {
              console.log(mut);

              const retry_button = document.querySelector(
                selectors.QR_RETRY_BUTTON
              );

              // Listens to retry button, when found, click it
              if (retry_button != null) {
                if (retry_button) retry_button.click();
              }
              // Listens to qr token change
              else if (
                mut.type === "attributes" &&
                mut.attributeName === "style"
              ) {
                this.computedStyle =
                  mut.target.style.backgroundImage.match(/url\("(.*)"/)[1];
                window.qrChanged(this.computedStyle);
              }
            });
          });

          obs.observe(qr_container, {
            attributes: true,
            attributeFilter: ["style"],
          });
        },

        {
          QR_CONTAINER,
          QR_RETRY_BUTTON,
        }
      );

      // Wait for code scan
      try {
        await page.waitForSelector(INTRO_IMG_SELECTOR, {
          timeout: 0,
        });
      } catch (error) {
        if (
          error.name === "ProtocolError" &&
          error.message &&
          error.message.match(/Target closed/)
        ) {
          // something has called .destroy() while waiting
          return;
        }

        throw error;
      }
    }

    // await page.evaluate(ExposeStore, moduleRaid.toString());
    const authEventPayload = await this.authStrategy.getAuthEventPayload();

    /**
     * Emitted when authentication is successful
     * @event Client#authenticated
     */
    this.emit(Events.AUTHENTICATED, authEventPayload);

    // Check window.Store Injection
    await page.waitForFunction("window.Store != undefined");

    /**
     * Emitted when the client has initialized and is ready to receive messages.
     * @event Client#ready
     */
    this.emit(Events.READY);
    this.authStrategy.afterAuthReady();

    // Disconnect when navigating away when in PAIRING state (detect logout)
    this.pupPage.on("framenavigated", async () => {
      const appState = await this.getState();
      if (!appState || appState === WAState.PAIRING) {
        await this.authStrategy.disconnect();
        this.emit(Events.DISCONNECTED, "NAVIGATION");
        await this.destroy();
      }
    });
  }

  /**
   * Closes the client
   */
  async destroy() {
    await this.pupBrowser.close();
    await this.authStrategy.destroy();
  }

  /**
   * Logs out the client, closing the current session
   */
  async logout() {
    await this.pupPage.evaluate(() => {
      return window.Store.AppState.logout();
    });

    await this.authStrategy.logout();
  }

  /**
   * check out item
   */
  async order(url) {
    await this.pupPage;
  }
}

module.exports = Client;
