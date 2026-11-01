// fade-in on scroll, staggered
const revealObserver = new IntersectionObserver(
  (entries) => {
    let staggerIndex = 0;
    entries.forEach((entry) => {
      if (!entry.isIntersecting) return;
      const delay = Math.min(staggerIndex, 5) * 60;
      staggerIndex++;
      entry.target.style.setProperty("--d", `${delay}ms`);
      entry.target.classList.add("in");
      revealObserver.unobserve(entry.target);
    });
  },
  { threshold: 0.15 }
);
document.querySelectorAll(".reveal").forEach((element) => revealObserver.observe(element));

// grid / list switch for the ingredients on recipe pages
document.querySelectorAll(".recipe .ingredients").forEach((list) => {
  const heading = list.parentElement.querySelector("h2");
  const headingRow = document.createElement("div");
  const toggleButton = document.createElement("button");
  headingRow.className = "section-head";
  toggleButton.type = "button";
  toggleButton.className = "view-toggle";
  toggleButton.textContent = "View as list";

  const toggleListView = () => {
    const isList = list.classList.toggle("as-list");
    if (isList) {
      toggleButton.textContent = "View as grid";
    } else {
      toggleButton.textContent = "View as list";
    }
  };
  toggleButton.addEventListener("click", () => {
    const canAnimate = document.startViewTransition && !matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (canAnimate) {
      document.startViewTransition(toggleListView);
    } else {
      toggleListView();
    }
  });
  heading.replaceWith(headingRow);
  headingRow.append(heading, toggleButton);
});

// drag-to-scroll for rails, mouse only
document.querySelectorAll(".rail").forEach((rail) => {
  let startX = 0;
  let startLeft = 0;
  let moved = false;
  let dragging = false;
  rail.addEventListener("pointerdown", (event) => {
    if (event.pointerType !== "mouse" || event.button !== 0 || rail.scrollWidth <= rail.clientWidth) return;
    dragging = true;
    moved = false;
    startX = event.clientX;
    startLeft = rail.scrollLeft;
  });
  rail.addEventListener("pointermove", (event) => {
    if (!dragging) return;
    const dx = event.clientX - startX;
    if (!moved && Math.abs(dx) < 5) return; // small wobble still counts as a click
    if (!moved) {
      moved = true;
      rail.setPointerCapture(event.pointerId);
      rail.classList.add("dragging");
    }
    rail.scrollLeft = startLeft - dx;
  });
  const endDrag = () => {
    if (!dragging) return;
    dragging = false;
    rail.classList.remove("dragging"); // scroll-snap comes back and settles on the nearest ticket
  };
  rail.addEventListener("pointerup", endDrag);
  rail.addEventListener("pointercancel", endDrag);
  // dragging over a link shouldn't also click it
  rail.addEventListener("click", (event) => {
    if (!moved) return;
    event.preventDefault();
    event.stopPropagation();
    moved = false;
  }, true);
  rail.addEventListener("dragstart", (event) => event.preventDefault()); // stops the ghost image when dragging a photo
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
// phones: show full size and scroll instead
const fullSize = matchMedia("(max-width: 768px)");
function setZoomed(on) {
  zoomView.classList.toggle("zoomed", on && !fullSize.matches);
  if (fullSize.matches) {
    zoomHint.textContent = "Move to look around.";
  } else if (on) {
    zoomHint.textContent = "Move to look around. Click to zoom out.";
  } else {
    zoomHint.textContent = "Click the picture to look closer.";
  }
}
// point the zoom origin at the cursor
function aim(event) {
  const rect = zoomPic.getBoundingClientRect(); // scaling doesn't change this box
  const x = Math.min(Math.max((event.clientX - rect.left) / rect.width, 0), 1);
  const y = Math.min(Math.max((event.clientY - rect.top) / rect.height, 0), 1);
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
    zoomPic.addEventListener("pointerdown", (event) => {
      aim(event);
      setZoomed(!zoomView.classList.contains("zoomed"));
    });
    zoomPic.addEventListener("pointermove", (event) => {
      if (zoomView.classList.contains("zoomed")) aim(event);
    });
    close.addEventListener("click", () => zoomView.close());
    zoomView.addEventListener("click", (event) => {
      if (event.target === zoomView) zoomView.close(); // clicked the dark area
    });
    zoomView.addEventListener("close", () => setZoomed(false));
  }
  zoomPic.src = img.currentSrc || img.src;
  zoomPic.alt = img.alt;
  setZoomed(false);
  zoomView.showModal();
  // open full-size view centered
  if (fullSize.matches) {
    zoomPic.decode().catch(() => {}).then(() => {
      zoomView.scrollTo(
        (zoomView.scrollWidth - zoomView.clientWidth) / 2,
        (zoomView.scrollHeight - zoomView.clientHeight) / 2
      );
    });
  }
}

// project page galleries: thumbnails, counter, prev/next, zoom
document.querySelectorAll(".project-photo").forEach((track) => {
  const slides = [...track.children];
  const gallery = document.createElement("div");
  gallery.className = "gallery";
  track.before(gallery);
  gallery.append(track);
  track.setAttribute("role", "region"); // aria-label gets ignored on a plain div
  track.setAttribute("aria-label", "Project images");
  track.tabIndex = 0; // so arrow keys can scroll it

  // single images only, level art is four in one
  const zoomableImage = (slide) => {
    if (slide.matches("img")) return slide;
    const images = slide.querySelectorAll("img");
    if (images.length === 1) return images[0];
    return null;
  };
  slides.forEach((slide) => {
    const img = zoomableImage(slide);
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
    const reduceMotion = matchMedia("(prefers-reduced-motion: reduce)").matches;
    track.scrollTo({
      left: slides[index].offsetLeft - track.offsetLeft,
      behavior: reduceMotion ? "auto" : "smooth"
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
  // keep counter synced however it scrolled
  const slideObserver = new IntersectionObserver((entries) => {
    entries.forEach((entry) => {
      if (entry.isIntersecting) showSlide(slides.indexOf(entry.target));
    });
  }, { root: track, threshold: 0.6 });
  slides.forEach((slide) => slideObserver.observe(slide));
  showSlide(0);
});

// autoplay loops unless reduced motion
if (!matchMedia("(prefers-reduced-motion: reduce)").matches) {
  document.querySelectorAll("video[loop]").forEach((video) => video.play().catch(() => {}));
}
