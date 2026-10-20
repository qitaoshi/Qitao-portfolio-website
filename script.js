// Fade sections in as they scroll into view. (The Lazy Susan lives in susan.js.)
const io = new IntersectionObserver(
  (entries) =>
    entries.forEach((e) => {
      if (e.isIntersecting) {
        e.target.classList.add("in");
        io.unobserve(e.target);
      }
    }),
  { threshold: 0.15 }
);
document.querySelectorAll(".reveal").forEach((el) => io.observe(el));

// Ingredients: a button beside the heading switches between the picture grid and a plain list.
document.querySelectorAll(".ingredients").forEach((list) => {
  const heading = list.parentElement.querySelector("h2");
  const head = document.createElement("div");
  const btn = document.createElement("button");
  head.className = "section-head";
  btn.type = "button";
  btn.className = "view-toggle";
  btn.textContent = "View as list";
  btn.addEventListener("click", () => {
    btn.textContent = list.classList.toggle("as-list") ? "View as grid" : "View as list";
  });
  heading.replaceWith(head);
  head.append(heading, btn);
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
