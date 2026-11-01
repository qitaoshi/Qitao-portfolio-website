const revealObserver = new IntersectionObserver(
  (entries) => {
    let visible = 0;
    entries.forEach((entry) => {
      if (!entry.isIntersecting) return;
      entry.target.style.setProperty("--d", `${Math.min(visible++, 5) * 60}ms`);
      entry.target.classList.add("in");
      revealObserver.unobserve(entry.target);
    });
  },
  { threshold: 0.15 }
);
document.querySelectorAll(".reveal").forEach((element) => revealObserver.observe(element));

document.querySelectorAll(".recipe .ingredients").forEach((list) => {
  const heading = list.parentElement.querySelector("h2");
  const headingRow = document.createElement("div");
  const toggleButton = document.createElement("button");
  headingRow.className = "section-head";
  toggleButton.type = "button";
  toggleButton.className = "view-toggle";
  toggleButton.textContent = "View as list";
  const toggleListView = () => {
    toggleButton.textContent = list.classList.toggle("as-list") ? "View as grid" : "View as list";
  };
  toggleButton.addEventListener("click", () => {
    if (document.startViewTransition && !matchMedia("(prefers-reduced-motion: reduce)").matches) {
      document.startViewTransition(toggleListView);
    } else {
      toggleListView();
    }
  });
  heading.replaceWith(headingRow);
  headingRow.append(heading, toggleButton);
});

// Only when the row actually scrolls (narrow windows); touch already scrolls natively.
document.querySelectorAll(".rail").forEach((rail) => {
  let startX = 0;
  let startLeft = 0;
  let moved = false;
  let dragging = false;
  rail.addEventListener("pointerdown", (e) => {
    if (e.pointerType !== "mouse" || e.button !== 0 || rail.scrollWidth <= rail.clientWidth) return;
    dragging = true;
    moved = false;
    startX = e.clientX;
    startLeft = rail.scrollLeft;
  });
  rail.addEventListener("pointermove", (e) => {
    if (!dragging) return;
    const dx = e.clientX - startX;
    if (!moved && Math.abs(dx) < 5) return; // a small wobble is still a click
    if (!moved) {
      moved = true;
      rail.setPointerCapture(e.pointerId);
      rail.classList.add("dragging");
    }
    rail.scrollLeft = startLeft - dx;
  });
  const end = () => {
    if (!dragging) return;
    dragging = false;
    rail.classList.remove("dragging"); // snapping comes back on and settles on the nearest ticket
  };
  rail.addEventListener("pointerup", end);
  rail.addEventListener("pointercancel", end);
  // a drag that ends over a link or button shouldn't also click it
  rail.addEventListener("click", (e) => {
    if (!moved) return;
    e.preventDefault();
    e.stopPropagation();
    moved = false;
  }, true);
  rail.addEventListener("dragstart", (e) => e.preventDefault()); // no ghost image when grabbing a screenshot
});

const ICONS = {
  prev: "M15 5l-7 7 7 7",
  next: "M9 5l7 7-7 7",
  zoom: "M10.5 4a6.5 6.5 0 1 0 0 13 6.5 6.5 0 0 0 0-13zM15.5 15.5L20 20M10.5 7.5v6M7.5 10.5h6",
  close: "M6 6l12 12M18 6L6 18"
};
function iconButton(name, label) {
  const button = document.createElement("button");
  button.type = "button";
  button.className = "icon-btn";
  button.setAttribute("aria-label", label);
  button.innerHTML = `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="${ICONS[name]}"/></svg>`;
  return button;
}

let zoomView, zoomPic, zoomHint;
// phones: a 2.5x tap-zoom of a 343px picture is still too small to read, so the dialog shows it at full size and scrolls instead
const fullSize = matchMedia("(max-width: 768px)");
function setZoomed(on) {
  zoomView.classList.toggle("zoomed", on && !fullSize.matches);
  if (fullSize.matches) {
    zoomHint.textContent = "Move to look around.";
  } else {
    zoomHint.textContent = on ? "Move to look around. Click to zoom out." : "Click the picture to look closer.";
  }
}
function aim(e) {
  const r = zoomPic.getBoundingClientRect(); // scale doesn't change this box
  const x = Math.min(Math.max((e.clientX - r.left) / r.width, 0), 1);
  const y = Math.min(Math.max((e.clientY - r.top) / r.height, 0), 1);
  zoomPic.style.transformOrigin = `${x * 100}% ${y * 100}%`;
}
function openZoom(img) {
  if (!zoomView) {
    zoomView = document.createElement("dialog");
    zoomView.className = "zoom";
    zoomView.setAttribute("aria-label", "Enlarged image");
    zoomPic = document.createElement("img");
    zoomHint = document.createElement("p");
    const close = iconButton("close", "Close");
    zoomView.append(zoomPic, close, zoomHint);
    document.body.append(zoomView);
    zoomPic.addEventListener("pointerdown", (e) => { aim(e); setZoomed(!zoomView.classList.contains("zoomed")); });
    zoomPic.addEventListener("pointermove", (e) => { if (zoomView.classList.contains("zoomed")) aim(e); });
    close.addEventListener("click", () => zoomView.close());
    zoomView.addEventListener("click", (e) => { if (e.target === zoomView) zoomView.close(); }); // click on the dark area
    zoomView.addEventListener("close", () => setZoomed(false));
  }
  zoomPic.src = img.currentSrc || img.src;
  zoomPic.alt = img.alt;
  setZoomed(false);
  zoomView.showModal();
  // full-size view opens on the middle of the picture, not its top-left corner
  if (fullSize.matches) {
    zoomPic.decode().catch(() => {}).then(() => {
      zoomView.scrollTo(
        (zoomView.scrollWidth - zoomView.clientWidth) / 2,
        (zoomView.scrollHeight - zoomView.clientHeight) / 2
      );
    });
  }
}

document.querySelectorAll(".project-photo").forEach((track) => {
  const slides = [...track.children];
  const gallery = document.createElement("div");
  gallery.className = "gallery";
  track.before(gallery);
  gallery.append(track);
  track.setAttribute("role", "region"); // screen readers ignore aria-label on a plain div
  track.setAttribute("aria-label", "Project images");
  track.tabIndex = 0; // so arrow keys can scroll it

  // only single pictures zoom; the Side Quests level art is four images in one panel
  const zoomableImage = (slide) => {
    if (slide.matches("img")) return slide;
    const images = slide.querySelectorAll("img");
    return images.length === 1 ? images[0] : null;
  };
  slides.forEach((s) => {
    const img = zoomableImage(s);
    if (!img) return;
    img.dataset.zoom = "";
    img.addEventListener("click", () => openZoom(img));
  });

  const bar = document.createElement("div");
  bar.className = "gallery-bar";
  const thumbs = document.createElement("div");
  thumbs.className = "thumbs";
  const nav = document.createElement("div");
  nav.className = "gallery-nav";
  const count = document.createElement("output");
  const prev = iconButton("prev", "Previous image");
  const next = iconButton("next", "Next image");
  const zoom = iconButton("zoom", "Enlarge image");
  nav.append(count, prev, next, zoom);
  bar.append(thumbs, nav);
  gallery.append(bar);

  const goToSlide = (index) => {
    track.scrollTo({
      left: slides[index].offsetLeft - track.offsetLeft,
      behavior: matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth"
    });
  };
  const thumbnailButtons = slides.map((slide, index) => {
    const button = document.createElement("button");
    button.type = "button";
    button.setAttribute("aria-label", `Image ${index + 1} of ${slides.length}`);
    const image = slide.querySelector("img") ?? slide;
    const thumbnail = document.createElement("img");
    thumbnail.src = slide.poster || image.currentSrc || image.src;
    thumbnail.alt = "";
    button.append(thumbnail);
    button.addEventListener("click", () => goToSlide(index));
    thumbs.append(button);
    return button;
  });

  let currentSlide = 0;
  const showSlide = (index) => {
    currentSlide = index;
    count.textContent = `${index + 1} / ${slides.length}`;
    thumbnailButtons.forEach((button, thumbnailIndex) => button.setAttribute("aria-current", thumbnailIndex === index));
    prev.disabled = index === 0;
    next.disabled = index === slides.length - 1;
    zoom.hidden = !zoomableImage(slides[index]);
  };
  prev.addEventListener("click", () => goToSlide(Math.max(currentSlide - 1, 0)));
  next.addEventListener("click", () => goToSlide(Math.min(currentSlide + 1, slides.length - 1)));
  zoom.addEventListener("click", () => openZoom(zoomableImage(slides[currentSlide])));
  // keep the counter right however the row was scrolled (arrows, swipe, trackpad)
  const seen = new IntersectionObserver((entries) => {
    entries.forEach((entry) => {
      if (entry.isIntersecting) showSlide(slides.indexOf(entry.target));
    });
  }, { root: track, threshold: 0.6 });
  slides.forEach((s) => seen.observe(s));
  showSlide(0);
});

// Looping clips (the ray tracer turntable) only play for visitors who allow motion; everyone else sees the poster frame.
if (!matchMedia("(prefers-reduced-motion: reduce)").matches) document.querySelectorAll("video[loop]").forEach((v) => v.play().catch(() => {}));
