/**
 * Domingo Camino Photography Portfolio
 * Main JavaScript
 */

document.addEventListener('DOMContentLoaded', () => {
    initPageLoader();
    initCustomCursor();
    initNavigation();
    initScrollAnimations();
    const relayout = initJustifiedLayout();
    initGalleryFilter(relayout);
    initGallerySort(relayout);
    initLightbox();
    initLanguagePicker();
});

/**
 * Page Loader
 */
function initPageLoader() {
    const loader = document.getElementById('pageLoader');
    if (!loader) return;

    // Hide loader after page loads
    window.addEventListener('load', () => {
        setTimeout(() => {
            loader.classList.add('loaded');
            setTimeout(() => {
                loader.style.display = 'none';
            }, 500);
        }, 300);
    });
}

/**
 * Language Picker
 */
function initLanguagePicker() {
    const langToggle = document.getElementById('langToggle');
    const langDropdown = document.getElementById('langDropdown');

    if (!langToggle || !langDropdown) return;

    langToggle.addEventListener('click', (e) => {
        e.stopPropagation();
        langDropdown.classList.toggle('active');
    });

    document.addEventListener('click', () => {
        langDropdown.classList.remove('active');
    });

    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') {
            langDropdown.classList.remove('active');
        }
    });
}

/**
 * Gallery Filter
 */
function initGalleryFilter(relayout) {
    const filterButtons = document.querySelectorAll('.filter-btn');
    const galleryItems = document.querySelectorAll('.gallery-item');

    if (!filterButtons.length || !galleryItems.length) return;

    filterButtons.forEach(btn => {
        btn.addEventListener('click', () => {
            filterButtons.forEach(b => b.classList.remove('active'));
            btn.classList.add('active');

            const filter = btn.dataset.filter;

            galleryItems.forEach(item => {
                if (item.dataset.visibleIn?.split(' ').includes(filter)) {
                    item.style.display = '';
                    item.style.animation = 'fadeInUp 0.5s ease forwards';
                } else {
                    item.style.display = 'none';
                }
            });

            if (relayout) relayout();
        });
    });
}

/**
 * Gallery Sort
 */
function initGallerySort(relayout) {
    const sortButtons = document.querySelectorAll('.sort-btn');
    const grid = document.getElementById('galleryGrid');

    if (!sortButtons.length || !grid) return;

    sortButtons.forEach(btn => {
        btn.addEventListener('click', () => {
            sortButtons.forEach(b => b.classList.remove('active'));
            btn.classList.add('active');

            const sortBy = btn.dataset.sort;
            const items = Array.from(grid.querySelectorAll('.gallery-item'));

            items.sort((a, b) => {
                if (sortBy === 'score') {
                    return parseInt(b.dataset.score || 0) - parseInt(a.dataset.score || 0);
                }
                // date descending (default)
                return (b.dataset.date || '').localeCompare(a.dataset.date || '');
            });

            items.forEach(item => grid.appendChild(item));
            if (relayout) relayout();
        });
    });
}

/**
 * Justified Layout
 * Computes photo row groupings and pixel dimensions at runtime using known
 * aspect ratios, so photos fill each row without cropping.
 */
function initJustifiedLayout() {
    const grid = document.getElementById('galleryGrid');
    if (!grid) return null;

    const GAP = 6; // px — must match gap in .gallery-grid CSS

    function layout() {
        const containerWidth = grid.clientWidth;
        if (!containerWidth) return;

        const items = Array.from(grid.querySelectorAll('.gallery-item'))
            .filter(el => el.style.display !== 'none');
        if (!items.length) return;

        const targetHeight = window.innerWidth < 640 ? 160 : window.innerWidth < 1024 ? 220 : 300;

        // Group items into rows
        const rows = [];
        let row = [];
        let rowAspectSum = 0;

        for (const item of items) {
            const img = item.querySelector('img');
            const w = parseInt(img.getAttribute('width')) || 0;
            const h = parseInt(img.getAttribute('height')) || 0;
            const aspect = w && h ? w / h : 3 / 2;

            row.push({ item, aspect });
            rowAspectSum += aspect;

            // Natural width of this row at targetHeight — if it fills the container, commit the row
            const naturalWidth = rowAspectSum * targetHeight + (row.length - 1) * GAP;
            if (naturalWidth >= containerWidth) {
                rows.push({ row, aspectSum: rowAspectSum, last: false });
                row = [];
                rowAspectSum = 0;
            }
        }
        // Remaining photos go in the last (incomplete) row — don't stretch them
        if (row.length) rows.push({ row, aspectSum: rowAspectSum, last: true });

        // Apply computed dimensions to each item
        for (const { row: rowItems, aspectSum, last } of rows) {
            const totalGap = (rowItems.length - 1) * GAP;
            const rowHeight = last ? targetHeight : (containerWidth - totalGap) / aspectSum;
            for (const { item, aspect } of rowItems) {
                const itemWidth = last
                    ? aspect * targetHeight
                    : (containerWidth - totalGap) * aspect / aspectSum;
                item.style.width = Math.floor(itemWidth) + 'px';
                item.style.height = Math.floor(rowHeight) + 'px';
            }
        }
    }

    layout();

    let resizeTimer;
    window.addEventListener('resize', () => {
        clearTimeout(resizeTimer);
        resizeTimer = setTimeout(layout, 100);
    });

    return layout;
}

/**
 * Lightbox
 */
function initLightbox() {
    const lightbox = document.getElementById('lightbox');
    const lightboxImg = document.getElementById('lightbox-img');
    const lightboxClose = document.querySelector('.lightbox-close');
    const lightboxPrev = document.querySelector('.lightbox-prev');
    const lightboxNext = document.querySelector('.lightbox-next');
    const lightboxLocation = document.querySelector('.lightbox-location');
    const lightboxTitle = document.querySelector('.lightbox-title');
    const lightboxDate = document.querySelector('.lightbox-date');
    const lightboxCamera = document.querySelector('.lightbox-camera');
    const lightboxFlickrLink = document.querySelector('.lightbox-flickr-link');
    const galleryItems = document.querySelectorAll('.gallery-item');

    if (!lightbox || !galleryItems.length) return;

    let currentIndex = 0;
    let visibleItems = [];

    function updateVisibleItems() {
        visibleItems = Array.from(galleryItems).filter(item => item.style.display !== 'none');
    }

    function showImage(index) {
        if (index < 0 || index >= visibleItems.length) return;
        currentIndex = index;
        const item = visibleItems[index];
        const img = item.querySelector('img');
        const location = item.querySelector('.gallery-location');
        const title = item.querySelector('.gallery-title');

        lightboxImg.src = img.src;
        lightboxImg.alt = img.alt;
        if (lightboxLocation) lightboxLocation.textContent = location ? location.textContent : '';
        if (lightboxTitle) lightboxTitle.textContent = title ? title.textContent : '';
        if (lightboxDate) {
            const raw = item.dataset.date || '';
            if (raw) {
                const d = new Date(raw.replace(' ', 'T'));
                lightboxDate.textContent = isNaN(d) ? '' : d.toLocaleDateString(document.documentElement.lang || 'en', { month: 'long', year: 'numeric' });
            } else {
                lightboxDate.textContent = '';
            }
        }
        if (lightboxCamera) lightboxCamera.textContent = item.dataset.camera || '';
        if (lightboxFlickrLink) {
            const url = item.dataset.flickrUrl || '';
            lightboxFlickrLink.href = url;
            lightboxFlickrLink.style.display = url ? '' : 'none';
        }
    }

    function openLightbox(index) {
        updateVisibleItems();
        showImage(index);
        lightbox.classList.add('active');
        document.body.style.overflow = 'hidden';
    }

    function closeLightbox() {
        lightbox.classList.remove('active');
        document.body.style.overflow = '';
    }

    // Click handlers
    galleryItems.forEach((item, index) => {
        item.addEventListener('click', () => {
            updateVisibleItems();
            const visibleIndex = visibleItems.indexOf(item);
            openLightbox(visibleIndex);
        });
    });

    if (lightboxClose) {
        lightboxClose.addEventListener('click', closeLightbox);
    }

    if (lightboxPrev) {
        lightboxPrev.addEventListener('click', () => {
            showImage(currentIndex - 1 < 0 ? visibleItems.length - 1 : currentIndex - 1);
        });
    }

    if (lightboxNext) {
        lightboxNext.addEventListener('click', () => {
            showImage(currentIndex + 1 >= visibleItems.length ? 0 : currentIndex + 1);
        });
    }

    // Keyboard navigation
    document.addEventListener('keydown', (e) => {
        if (!lightbox.classList.contains('active')) return;
        if (e.key === 'Escape') closeLightbox();
        if (e.key === 'ArrowLeft') lightboxPrev?.click();
        if (e.key === 'ArrowRight') lightboxNext?.click();
    });

    // Close on background click
    lightbox.addEventListener('click', (e) => {
        if (e.target === lightbox) closeLightbox();
    });
}

/**
 * Custom Cursor
 */
function initCustomCursor() {
    const dot = document.querySelector('.cursor-dot');
    const outline = document.querySelector('.cursor-outline');

    if (!dot || !outline) return;

    // Check for touch device
    if ('ontouchstart' in window) {
        dot.style.display = 'none';
        outline.style.display = 'none';
        return;
    }

    let cursorX = 0;
    let cursorY = 0;
    let outlineX = 0;
    let outlineY = 0;

    document.addEventListener('mousemove', (e) => {
        cursorX = e.clientX;
        cursorY = e.clientY;
        dot.style.left = cursorX + 'px';
        dot.style.top = cursorY + 'px';
    });

    // Smooth outline follow
    function animateOutline() {
        outlineX += (cursorX - outlineX) * 0.15;
        outlineY += (cursorY - outlineY) * 0.15;
        outline.style.left = outlineX + 'px';
        outline.style.top = outlineY + 'px';
        requestAnimationFrame(animateOutline);
    }
    animateOutline();

    // Hover effect on interactive elements
    const addHoverListeners = () => {
        const interactiveElements = document.querySelectorAll('a, button, .gallery-item');
        interactiveElements.forEach(el => {
            el.addEventListener('mouseenter', () => {
                outline.classList.add('hover');
            });
            el.addEventListener('mouseleave', () => {
                outline.classList.remove('hover');
            });
        });
    };

    // Initial setup
    addHoverListeners();

    // Re-attach after dynamic content loads
    const observer = new MutationObserver(() => {
        addHoverListeners();
    });

    observer.observe(document.body, { childList: true, subtree: true });
}

/**
 * Navigation
 */
function initNavigation() {
    const nav = document.querySelector('.nav');
    const navToggle = document.getElementById('navToggle');
    const navMenu = document.getElementById('navMenu');

    // Scroll behavior
    let lastScroll = 0;
    window.addEventListener('scroll', () => {
        const currentScroll = window.pageYOffset;

        // Add/remove scrolled class
        if (currentScroll > 100) {
            nav.classList.add('scrolled');
        } else {
            nav.classList.remove('scrolled');
        }

        lastScroll = currentScroll;
    });

    // Mobile menu toggle
    if (navToggle && navMenu) {
        const navMenuClose = document.getElementById('navMenuClose');

        navToggle.addEventListener('click', () => {
            navMenu.classList.toggle('active');
            navToggle.classList.toggle('active');
        });

        // Close button
        if (navMenuClose) {
            navMenuClose.addEventListener('click', () => {
                navMenu.classList.remove('active');
                navToggle.classList.remove('active');
            });
        }

        // Close menu on link click
        navMenu.querySelectorAll('a').forEach(link => {
            link.addEventListener('click', () => {
                navMenu.classList.remove('active');
                navToggle.classList.remove('active');
            });
        });
    }
}

/**
 * Scroll Animations
 */
function initScrollAnimations() {
    const observeElements = () => {
        const animatedElements = document.querySelectorAll(
            '.section-header, .gallery-item, .timeline-item, .about-intro, .about-story, .about-philosophy'
        );

        if (!animatedElements.length) return;

        const observer = new IntersectionObserver((entries) => {
            entries.forEach(entry => {
                if (entry.isIntersecting) {
                    entry.target.style.animation = 'fadeInUp 0.8s ease forwards';
                    observer.unobserve(entry.target);
                }
            });
        }, {
            threshold: 0.1,
            rootMargin: '0px 0px -50px 0px'
        });

        animatedElements.forEach(el => {
            if (!el.style.opacity) {
                el.style.opacity = '0';
            }
            observer.observe(el);
        });
    };

    // Initial observation
    observeElements();

    // Re-observe after dynamic content loads
    const mutationObserver = new MutationObserver(() => {
        setTimeout(observeElements, 100);
    });

    const galleryGrid = document.getElementById('galleryGrid');
    if (galleryGrid) {
        mutationObserver.observe(galleryGrid, { childList: true });
    }
}

/**
 * Smooth scroll for anchor links
 */
document.querySelectorAll('a[href^="#"]').forEach(anchor => {
    anchor.addEventListener('click', function(e) {
        const target = document.querySelector(this.getAttribute('href'));
        if (!target) return;
        e.preventDefault();
        target.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
});

/**
 * Parallax effect for hero (subtle)
 */
const hero = document.querySelector('.hero-bg');
if (hero) {
    window.addEventListener('scroll', () => {
        const scrolled = window.pageYOffset;
        if (scrolled < window.innerHeight) {
            hero.style.transform = `translateY(${scrolled * 0.3}px)`;
        }
    });
}
