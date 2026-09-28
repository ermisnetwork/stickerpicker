// maunium-stickerpicker - A fast and simple Matrix sticker picker widget.
// Copyright (C) 2020 Tulir Asokan
//
// This program is free software: you can redistribute it and/or modify
// it under the terms of the GNU Affero General Public License as published by
// the Free Software Foundation, either version 3 of the License, or
// (at your option) any later version.
//
// This program is distributed in the hope that it will be useful,
// but WITHOUT ANY WARRANTY; without even the implied warranty of
// MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
// GNU Affero General Public License for more details.
//
// You should have received a copy of the GNU Affero General Public License
// along with this program.  If not, see <https://www.gnu.org/licenses/>.
import { html, render, Component } from "../lib/htm/preact.js";
import { Spinner } from "./spinner.js";
import { SearchBox } from "./search-box.js";
import { giphyIsEnabled, GiphySearchTab, setGiphyAPIKey } from "./giphy.js";
import * as widgetAPI from "./widget-api.js";
import * as frequent from "./frequently-used.js";

// The base URL for fetching packs. The app will first fetch ${PACK_BASE_URL}/index.json,
// then ${PACK_BASE_URL}/${packFile} for each packFile in the packs object of the index.json file.
const PACKS_BASE_URL = "packs";

let INDEX = `${PACKS_BASE_URL}/index.json`;
const params = new URLSearchParams(document.location.search);
if (params.has("config")) {
	INDEX = params.get("config");
}

const makeThumbnailURL = (mxc) =>
	`${PACKS_BASE_URL}/thumbnails/${mxc.split("/").slice(-1)[0]}`;

// We need to detect iOS webkit because it has a bug related to scrolling non-fixed divs
// This is also used to fix scrolling to sections on Element iOS
const isMobileSafari =
	navigator.userAgent.match(/(iPod|iPhone|iPad)/) &&
	navigator.userAgent.match(/AppleWebKit/);

const supportedThemes = ["light", "dark", "black"];

const defaultState = {
	packs: [],
	filtering: {
		searchTerm: "",
		packs: [],
	},
};

// A map to keep track of which TGS animations have been loaded
const loadedTgsMap = new WeakMap();

const HIDE_SETTINGS = params.has("hideSettings");

const CUSTOM_COLUMNS = params.has("columns")
	? parseInt(params.get("columns"), 10)
	: null;

const CUSTOM_NAV_SIZE = params.has("navSize")
	? parseInt(params.get("navSize"), 10)
	: null;

class App extends Component {
	constructor(props) {
		super(props);
		this.defaultTheme = params.get("theme");
		this.state = {
			viewingGifs: false,
			packs: defaultState.packs,
			loading: true,
			error: null,
			stickersPerRow:
				CUSTOM_COLUMNS ||
				parseInt(localStorage.mauStickersPerRow || "4"),
			navSize: CUSTOM_NAV_SIZE || 12,
			hideSettings: HIDE_SETTINGS,
			theme: localStorage.mauStickerThemeOverride || this.defaultTheme,
			frequentlyUsed: {
				id: "frequently-used",
				title: "Frequently used",
				stickerIDs: frequent.get(),
				stickers: [],
			},
			filtering: defaultState.filtering,
		};
		if (!supportedThemes.includes(this.state.theme)) {
			this.state.theme = "light";
		}
		if (!supportedThemes.includes(this.defaultTheme)) {
			this.defaultTheme = "light";
		}
		this.stickersByID = new Map(
			JSON.parse(localStorage.mauFrequentlyUsedStickerCache || "[]")
		);
		this.state.frequentlyUsed.stickers = this._getStickersByID(
			this.state.frequentlyUsed.stickerIDs
		);
		this.imageObserver = null;
		this.packListRef = null;
		this.navRef = null;
		this.searchStickers = this.searchStickers.bind(this);
		this.sendSticker = this.sendSticker.bind(this);
		this.navScroll = this.navScroll.bind(this);
		this.reloadPacks = this.reloadPacks.bind(this);
		this.observeSectionIntersections =
			this.observeSectionIntersections.bind(this);
		this.observeImageIntersections =
			this.observeImageIntersections.bind(this);
	}

	_getStickersByID(ids) {
		return ids
			.map((id) => this.stickersByID.get(id))
			.filter((sticker) => !!sticker);
	}

	setNavSize(val) {
		document.documentElement.style.setProperty(
			"--nav-sticker-size",
			`${val}vw`
		);
		this.setState({
			navSize: val,
		});
	}

	updateFrequentlyUsed() {
		const stickerIDs = frequent.get();
		const stickers = this._getStickersByID(stickerIDs);
		this.setState({
			frequentlyUsed: {
				...this.state.frequentlyUsed,
				stickerIDs,
				stickers,
			},
		});
		localStorage.mauFrequentlyUsedStickerCache = JSON.stringify(
			stickers.map((sticker) => [sticker.id, sticker])
		);
	}

	searchStickers(e) {
		const sanitizeString = (s) => (s || "").toLowerCase().trim();
		const searchTerm = sanitizeString(e.target.value);

		const allPacks = [this.state.frequentlyUsed, ...this.state.packs];
		const packsWithFilteredStickers = allPacks.map((pack) => {
			const packTitleMatch =
				sanitizeString(pack.title).includes(searchTerm) ||
				sanitizeString(pack.id).includes(searchTerm) ||
				sanitizeString(pack.telegram?.short_name).includes(searchTerm);

			return {
				...pack,
				stickers: pack.stickers.filter(
					(sticker) =>
						packTitleMatch ||
						sanitizeString(sticker.body).includes(searchTerm) ||
						sanitizeString(sticker.id).includes(searchTerm)
				),
			};
		});

		this.setState({
			filtering: {
				...this.state.filtering,
				searchTerm,
				packs: packsWithFilteredStickers.filter(
					({ stickers }) => !!stickers.length
				),
			},
		});
	}

	setStickersPerRow(val) {
		localStorage.mauStickersPerRow = val;
		document.documentElement.style.setProperty(
			"--stickers-per-row",
			localStorage.mauStickersPerRow
		);
		this.setState({
			stickersPerRow: val,
		});
		this.packListRef.scrollTop = this.packListRef.scrollHeight;
	}

	setTheme(theme) {
		if (theme === "default") {
			delete localStorage.mauStickerThemeOverride;
			this.setState({ theme: this.defaultTheme });
		} else {
			localStorage.mauStickerThemeOverride = theme;
			this.setState({ theme: theme });
		}
	}

	reloadPacks() {
		this.imageObserver.disconnect();
		this.sectionObserver.disconnect();
		this.setState({
			packs: defaultState.packs,
			filtering: defaultState.filtering,
		});
		this._loadPacks(true);
	}

	_loadPacks(disableCache = false) {
		const cache = disableCache ? "no-cache" : undefined;
		fetch(INDEX, { cache }).then(
			async (indexRes) => {
				if (indexRes.status >= 400) {
					this.setState({
						loading: false,
						error:
							indexRes.status !== 404
								? indexRes.statusText
								: null,
					});
					return;
				}
				const indexData = await indexRes.json();
				if (indexData.giphy_api_key !== undefined) {
					setGiphyAPIKey(
						indexData.giphy_api_key,
						indexData.giphy_mxc_prefix
					);
				}
				// TODO only load pack metadata when scrolled into view?
				for (const packFile of indexData.packs) {
					let packRes;
					if (
						packFile.startsWith("https://") ||
						packFile.startsWith("http://")
					) {
						packRes = await fetch(packFile, { cache });
					} else {
						packRes = await fetch(`${PACKS_BASE_URL}/${packFile}`, {
							cache,
						});
					}
					const packData = await packRes.json();
					const seenInPack = new Set();
					for (let i = 0; i < packData.stickers.length; i++) {
						const sticker = packData.stickers[i];
						if (
							!sticker.id ||
							seenInPack.has(sticker.id) ||
							(this.stickersByID.has(sticker.id) &&
								this.stickersByID.get(sticker.id)?.url !== sticker.url)
						) {
							const safeUrl = (sticker.url || "").replace(/[^a-zA-Z0-9_-]/g, "_");
							sticker.id = `${packData.id || "pack"}_${sticker.id || "stk"}_${safeUrl || i}`;
						}
						seenInPack.add(sticker.id);
						this.stickersByID.set(sticker.id, sticker);
					}
					this.setState({
						packs: [...this.state.packs, packData],
						loading: false,
					});
				}
				this.updateFrequentlyUsed();
			},
			(error) => this.setState({ loading: false, error })
		);
	}

	componentDidMount() {
		document.documentElement.style.setProperty(
			"--stickers-per-row",
			this.state.stickersPerRow.toString()
		);
		document.documentElement.style.setProperty(
			"--nav-sticker-size",
			`${this.state.navSize}vw`
		);
		this._loadPacks();
		this.imageObserver = new IntersectionObserver(
			this.observeImageIntersections,
			{
				rootMargin: "100px",
			}
		);
		this.sectionObserver = new IntersectionObserver(
			this.observeSectionIntersections
		);
	}

	observeImageIntersections(intersections) {
		for (const entry of intersections) {
			const elem = entry.target.children.item(0);
			if (entry.isIntersecting && elem) {
				const dataSrc = elem.getAttribute("data-src");
				if (dataSrc) {
					elem.setAttribute("src", dataSrc);
					elem.removeAttribute("data-src");
				}
				elem.classList.add("visible");
			}
		}
	}

	observeSectionIntersections(intersections) {
		const navWidth = this.navRef.getBoundingClientRect().width;
		let minX = 0,
			maxX = navWidth;
		let minXElem = null;
		let maxXElem = null;
		for (const entry of intersections) {
			const packID = entry.target.getAttribute("data-pack-id");
			if (!packID) {
				continue;
			}
			const navElement = document.getElementById(`nav-${packID}`);
			if (entry.isIntersecting) {
				navElement.classList.add("visible");
				const bb = navElement.getBoundingClientRect();
				if (bb.x < minX) {
					minX = bb.x;
					minXElem = navElement;
				} else if (bb.right > maxX) {
					maxX = bb.right;
					maxXElem = navElement;
				}
			} else {
				navElement.classList.remove("visible");
			}
		}
		if (minXElem !== null) {
			minXElem.scrollIntoView({ inline: "start" });
		} else if (maxXElem !== null) {
			maxXElem.scrollIntoView({ inline: "end" });
		}
	}

	componentDidUpdate() {
		if (this.packListRef === null) {
			return;
		}
		for (const elem of this.packListRef.getElementsByClassName("sticker")) {
			this.imageObserver.observe(elem);
		}
		for (const elem of this.packListRef.children) {
			this.sectionObserver.observe(elem);
		}
	}

	componentWillUnmount() {
		this.imageObserver.disconnect();
		this.sectionObserver.disconnect();
	}

	sendSticker(stickerOrEvt, maybeEvt) {
		let sticker = null;
		let evt = null;

		if (stickerOrEvt && typeof stickerOrEvt.preventDefault === "function") {
			evt = stickerOrEvt;
		} else {
			sticker = stickerOrEvt;
			evt = maybeEvt;
		}

		if (evt) {
			evt.preventDefault();
			evt.stopPropagation();
		}

		if (!sticker && evt && evt.currentTarget) {
			const id = evt.currentTarget.getAttribute("data-sticker-id");
			sticker = this.stickersByID.get(id);
		}

		if (!sticker) return;

		frequent.add(sticker.id);
		this.updateFrequentlyUsed();
		widgetAPI.sendSticker(sticker);

		// Keep focus on search input if it was focused
		const searchInput = document.querySelector(".search-box input");
		if (searchInput) {
			searchInput.focus();
		}
	}

	navScroll(evt) {
		this.navRef.scrollLeft += evt.deltaY;
	}

	render() {
		const theme = `theme-${this.state.theme}`;
		const filterActive = !!this.state.filtering.searchTerm;
		const packs = filterActive
			? this.state.filtering.packs
			: [this.state.frequentlyUsed, ...this.state.packs];

		if (this.state.loading) {
			return html`
				<main class="spinner ${theme}">
					<${Spinner} size=${80} green />
				</main>
			`;
		} else if (this.state.error) {
			return html`
				<main class="error ${theme}">
					<h1>Failed to load packs</h1>
					<p>${this.state.error}</p>
				</main>
			`;
		} else if (this.state.packs.length === 0) {
			return html`
				<main class="empty ${theme}"><h1>No packs found 😿</h1></main>
			`;
		}

		const onClickOverride = null;
		const switchToGiphy = () =>
			this.setState({
				viewingGifs: true,
				filtering: defaultState.filtering,
			});

		return html` <main class="has-content ${theme}">
			<nav
				onWheel=${this.navScroll}
				ref=${(elem) => (this.navRef = elem)}
			>
				<${NavBarItem}
					pack=${this.state.frequentlyUsed}
					iconOverride="recent"
					onClickOverride=${onClickOverride}
				/>
				${this.state.packs.map(
					(pack) =>
						html`<${NavBarItem}
							id=${pack.id}
							pack=${pack}
							onClickOverride=${onClickOverride}
						/>`
				)}
				${!this.state.hideSettings
					? html`
							<${NavBarItem}
								pack=${{ id: "settings", title: "Settings" }}
								iconOverride="settings"
								onClickOverride=${onClickOverride}
							/>
					  `
					: null}
			</nav>

			${this.state.viewingGifs
				? html` <${GiphySearchTab} /> `
				: html`
						<${SearchBox}
							onInput=${this.searchStickers}
							value=${this.state.filtering.searchTerm ?? ""}
						/>
						<div
							class="pack-list ${isMobileSafari
								? "ios-safari-hack"
								: ""}"
							ref=${(elem) => (this.packListRef = elem)}
						>
							${filterActive && packs.length === 0
								? html`<div class="search-empty">
										<h1>No stickers match your search</h1>
								  </div>`
								: null}
							${packs.map(
								(pack) =>
									html`<${Pack}
										id=${pack.id}
										pack=${pack}
										send=${this.sendSticker}
									/>`
							)}
							${!this.state.hideSettings
								? html`<${Settings} app=${this} />`
								: null}
						</div>
				  `}
		</main>`;
	}
}

class ImportPackForm extends Component {
	constructor(props) {
		super(props);
		this.state = {
			url: "",
			securityCode: "",
			ext: "webp",
			isAnimated: false,
			loading: false,
			status: null,
		};
		this.handleImport = this.handleImport.bind(this);
	}

	async handleImport(e) {
		e.preventDefault();
		const { url, securityCode, ext, isAnimated } = this.state;
		if (!url || !securityCode) {
			this.setState({
				status: { type: "error", text: "Vui lòng nhập Link Telegram và Mã bảo mật!" },
			});
			return;
		}

		this.setState({ loading: true, status: { type: "info", text: "Đang tải sticker pack về máy..." } });

		try {
			const res = await fetch("/api/import", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({
					url,
					security_code: securityCode,
					ext,
					is_animated: isAnimated,
				}),
			});
			let data = {};
			try {
				data = await res.json();
			} catch (jsonErr) {
				data = {
					success: false,
					error: res.status === 405
						? "Lỗi 405 (Method Not Allowed): Vui lòng tắt server cũ (python -m http.server) và chạy lệnh `python server.py` để khởi động lại máy chủ!"
						: `Lỗi máy chủ HTTP ${res.status} (${res.statusText})`,
				};
			}
			if (res.ok && data.success) {
				this.setState({
					loading: false,
					url: "",
					status: { type: "success", text: "Tải pack thành công! Đã tự động cập nhật." },
				});
				if (this.props.app) {
					this.props.app.reloadPacks();
				}
			} else {
				this.setState({
					loading: false,
					status: { type: "error", text: data.error || `Tải pack thất bại (Mã lỗi ${res.status}).` },
				});
			}
		} catch (err) {
			this.setState({
				loading: false,
				status: { type: "error", text: "Lỗi kết nối máy chủ: " + err.message },
			});
		}
	}

	render() {
		return html`
			<div class="import-pack-form" style="margin-top: 1.5rem; padding: 1rem; border: 1px solid var(--highlight-color); border-radius: 0.5rem; background-color: rgba(0,0,0,0.05);">
				<h2 style="margin-top: 0; font-size: 1.1rem;">➕ Thêm Sticker Pack Mới (Telegram)</h2>
				<form onSubmit=${this.handleImport}>
					<div style="margin-bottom: 0.75rem;">
						<label style="display: block; margin-bottom: 0.25rem; font-weight: bold;">Telegram Pack Link:</label>
						<input
							type="text"
							placeholder="https://t.me/addstickers/MonoMemeee"
							value=${this.state.url}
							onInput=${(e) => this.setState({ url: e.target.value })}
							style="width: 100%; padding: 0.5rem; box-sizing: border-box; border-radius: 0.25rem; border: 1px solid #ccc; background-color: var(--search-box-color); color: var(--text-color);"
							required
						/>
					</div>
					<div style="margin-bottom: 0.75rem;">
						<label style="display: block; margin-bottom: 0.25rem; font-weight: bold;">Mã bảo mật (Security Code):</label>
						<input
							type="password"
							placeholder="Nhập mã bảo mật"
							value=${this.state.securityCode}
							onInput=${(e) => this.setState({ securityCode: e.target.value })}
							style="width: 100%; padding: 0.5rem; box-sizing: border-box; border-radius: 0.25rem; border: 1px solid #ccc; background-color: var(--search-box-color); color: var(--text-color);"
							required
						/>
					</div>
					<div style="margin-bottom: 0.75rem; display: flex; gap: 1rem; align-items: center; flex-wrap: wrap;">
						<label>
							<input
								type="checkbox"
								checked=${this.state.isAnimated}
								onChange=${(e) => this.setState({ isAnimated: e.target.checked })}
							/>
							Sticker Động (Animated TGS)
						</label>
						${!this.state.isAnimated
							? html`
									<label>
										Định dạng:
										<select
											value=${this.state.ext}
											onChange=${(e) => this.setState({ ext: e.target.value })}
											style="margin-left: 0.5rem; padding: 0.2rem; background-color: var(--search-box-color); color: var(--text-color);"
										>
											<option value="webp">WebP</option>
											<option value="png">PNG</option>
											<option value="jpg">JPG</option>
										</select>
									</label>
							  `
							: null}
					</div>
					<button
						type="submit"
						disabled=${this.state.loading}
						style="padding: 0.6rem 1.2rem; background-color: #28a745; color: white; border: none; border-radius: 0.25rem; cursor: pointer; font-weight: bold;"
					>
						${this.state.loading ? "Đang tải về..." : "Tải Sticker Pack"}
					</button>
				</form>
				${this.state.status
					? html`
							<div
								style="margin-top: 0.75rem; padding: 0.5rem; border-radius: 0.25rem; color: white; background-color: ${this.state.status.type === "success"
									? "#28a745"
									: this.state.status.type === "info"
									? "#17a2b8"
									: "#dc3545"};"
							>
								${this.state.status.text}
							</div>
					  `
					: null}
			</div>
		`;
	}
}

const Settings = ({ app }) => html`
	<section
		class="stickerpack settings"
		id="pack-settings"
		data-pack-id="settings"
	>
		<h1>Settings</h1>
		<div class="settings-list">
			<button onClick=${app.reloadPacks}>Reload</button>
			<div>
				<label for="stickers-per-row"
					>Stickers per row: ${app.state.stickersPerRow}</label
				>
				<input
					type="range"
					min="2"
					max="10"
					id="stickers-per-row"
					id="stickers-per-row"
					value=${app.state.stickersPerRow}
					onInput=${(evt) => app.setStickersPerRow(evt.target.value)}
				/>
			</div>
			<div>
				<label for="theme">Theme: </label>
				<select
					name="theme"
					id="theme"
					onChange=${(evt) => app.setTheme(evt.target.value)}
				>
					<option value="default">Default</option>
					<option value="light">Light</option>
					<option value="dark">Dark</option>
					<option value="black">Black</option>
				</select>
			</div>
			<${ImportPackForm} app=${app} />
		</div>
	</section>
`;

// By default we just let the browser handle scrolling to sections, but webviews on Element iOS
// open the link in the browser instead of just scrolling there, so we need to scroll manually:
const scrollToSection = (evt, id) => {
	const pack = document.getElementById(`pack-${id}`);
	if (pack) {
		pack.scrollIntoView({ block: "start", behavior: "instant" });
	}
	evt?.preventDefault();

	const searchInput = document.querySelector(".search-box input");
	if (searchInput) {
		setTimeout(() => {
			searchInput.focus();
		}, 100);
	}
};

const NavBarItem = ({
	pack,
	iconOverride = null,
	onClickOverride = null,
	extraClass = null,
}) => {
	const hasStickers =
		Array.isArray(pack.stickers) && pack.stickers.length > 0;
	const sticker = hasStickers ? pack.stickers[0] : null;
	const isTgs = sticker?.url?.endsWith(".tgs");
	const isWebm = sticker?.url?.endsWith(".webm");

	const tgsRef = (el) => {
		if (!el || !isTgs || loadedTgsMap.has(el)) return;
		loadedTgsMap.set(el, true);

		fetch(sticker.url)
			.then((res) => res.arrayBuffer())
			.then((buffer) => {
				const decompressed = window.pako.ungzip(new Uint8Array(buffer));
				const animationData = JSON.parse(
					new TextDecoder().decode(decompressed)
				);

				window.lottie.loadAnimation({
					container: el,
					renderer: "canvas",
					loop: true,
					autoplay: true,
					animationData,
					rendererSettings: {
						useWebWorker: true,
						clearCanvas: true,
						progressiveLoad: false,
					},
				});
			})
			.catch((err) => {
				console.error("NavBarItem TGS load error:", err);
			});
	};

	return html`
		<a
			href="#pack-${pack.id}"
			id="nav-${pack.id}"
			data-pack-id=${pack.id}
			title=${pack.title}
			class="${extraClass}"
			onClick=${onClickOverride
				? (evt) => onClickOverride(evt, pack.id)
				: isMobileSafari
				? (evt) => scrollToSection(evt, pack.id)
				: undefined}
		>
			<div class="sticker">
				${iconOverride
					? html` <span class="icon icon-${iconOverride}" /> `
					: !hasStickers
					? html` <span class="icon icon-placeholder" /> `
					: isTgs
					? html`
							<div
								ref=${tgsRef}
								class="tgs-container"
								title=${sticker.body}
							></div>
					  `
					: isWebm
					? html`
							<video
								src=${makeThumbnailURL(sticker.url)}
								autoplay
								loop
								muted
								playsinline
								class="visible"
								style="width: 100%; height: 100%; object-fit: contain; pointer-events: none;"
							></video>
					  `
					: html`
							<img
								src=${makeThumbnailURL(sticker.url)}
								alt=${sticker.body}
								class="visible"
							/>
					  `}
			</div>
		</a>
	`;
};

const Pack = ({ pack, send }) => html`
	<section class="stickerpack" id="pack-${pack.id}" data-pack-id=${pack.id}>
		<h1>${pack.title}</h1>
		<div class="sticker-list">
			${pack.stickers.map(
				(sticker, idx) => html`
					<${Sticker}
						key=${sticker.id ? `${sticker.id}_${idx}` : idx}
						content=${sticker}
						send=${send}
					/>
				`
			)}
		</div>
	</section>
`;

const observeWhenVisible = (el, callback) => {
	if (!("IntersectionObserver" in window)) {
		callback();
		return;
	}

	const observer = new IntersectionObserver((entries, obs) => {
		for (const entry of entries) {
			if (entry.isIntersecting) {
				callback();
				obs.disconnect();
				break;
			}
		}
	});
	observer.observe(el);
};

const Sticker = ({ content, send }) => {
	const isTgs = content.url.endsWith(".tgs");
	const isWebm = content.url.endsWith(".webm");
	const handleClick = (e) => send(content, e);

	const tgsRef = (el) => {
		if (!el || !isTgs || loadedTgsMap.has(el)) return;
		loadedTgsMap.set(el, true);

		observeWhenVisible(el, () => {
			el.dataset.loaded = "1";

			fetch(content.url)
				.then((res) => res.arrayBuffer())
				.then((buffer) => {
					const decompressed = window.pako.ungzip(
						new Uint8Array(buffer)
					);
					const animationData = JSON.parse(
						new TextDecoder().decode(decompressed)
					);

					window.lottie.loadAnimation({
						container: el,
						renderer: "canvas",
						loop: true,
						autoplay: true,
						animationData,
						rendererSettings: {
							useWebWorker: true,
							clearCanvas: true,
							progressiveLoad: false,
						},
					});
				})
				.catch((err) => {
					console.error("Tgs load error:", err);
				});
		});
	};

	if (isTgs) {
		return html`
			<div
				class="sticker tgs-sticker"
				onClick=${handleClick}
				data-sticker-id=${content.id}
			>
				<div
					ref=${tgsRef}
					class="tgs-container"
					title=${content.body}
				></div>
			</div>
		`;
	}

	if (isWebm) {
		return html`
			<div
				class="sticker webm-sticker"
				onClick=${handleClick}
				data-sticker-id=${content.id}
			>
				<video
					data-src=${makeThumbnailURL(content.url)}
					autoplay
					loop
					muted
					playsinline
					title=${content.body}
					style="width: 100%; height: 100%; object-fit: contain; pointer-events: none;"
				></video>
			</div>
		`;
	}

	return html`
		<div class="sticker" onClick=${handleClick} data-sticker-id=${content.id}>
			<img
				loading="lazy"
				data-src=${makeThumbnailURL(content.url)}
				alt=${content.body}
				title=${content.body}
			/>
		</div>
	`;
};

render(html`<${App} />`, document.body);
