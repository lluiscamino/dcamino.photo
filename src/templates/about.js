import { head } from './partials/head.js';
import { nav } from './partials/nav.js';
import { footer } from './partials/footer.js';

export function aboutPage({ lang, config, translations, basePath = '.' }) {
  const t = translations[lang];
  const photos = config.photos || [];

  const getPageHref = (page) => {
    if (lang === 'es') return `${basePath}/${page}`;
    return `${basePath}/${lang}/${page}`;
  };

  // Extract unique regions from photos for the places cloud
  const uniqueLocations = [...new Set(
    photos.map(p => p.location?.region || p.location?.country).filter(Boolean)
  )];
  const placesCloud = uniqueLocations.map(loc => `<span>${loc}</span>`).join('\n                        ');

  return `${head({ title: `${t['about.label']} | Domingo Camino`, lang, basePath, description: t['meta.description.about'], siteUrl: config.site.url })}
<body class="about-page">
    <!-- Cursor follower -->
    <div class="cursor-dot"></div>
    <div class="cursor-outline"></div>

    ${nav({ lang, currentPage: 'about.html', translations, basePath, isDark: true })}

    <!-- About Hero -->
    <section class="about-hero">
        <div class="about-hero-content">
            <div class="about-hero-text">
                <span class="about-label">${t['about.label']}</span>
                <h1 class="about-title">Domingo Camino</h1>
                <p class="about-subtitle">${t['about.subtitle']}</p>
            </div>
        </div>
        <div class="about-hero-image">
            <div class="image-frame">
                <img src="${basePath}/images/domingo.jpg" alt="Photographer Portrait" loading="lazy">
            </div>
            <div class="image-decoration"></div>
        </div>
    </section>

    <!-- About Content -->
    <section class="about-content">
        <div class="about-grid">
            <div class="about-main">
                <div class="about-intro">
                    <p class="lead">${t['about.intro']}</p>
                </div>

                <div class="about-philosophy">
                    <h2>${t['about.philosophy.title']}</h2>
                    <p>${t['about.philosophy.p1']}</p>
                    <p>${t['about.philosophy.p2']}</p>
                </div>
            </div>

            <aside class="about-sidebar">
                <div class="sidebar-section">
                    <h3>${t['about.sidebar.location']}</h3>
                    <p>${t['about.sidebar.locationText']}</p>
                </div>

                <div class="sidebar-section">
                    <h3>${t['about.sidebar.places']}</h3>
                    <div class="places-cloud">
                        ${placesCloud}
                    </div>
                </div>

                <div class="sidebar-section">
                    <h3>${t['about.sidebar.connect']}</h3>
                    <a href="https://www.flickr.com/photos/dcaminosastre/" target="_blank" rel="noopener" class="connect-link">
                        <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
                            <circle cx="6" cy="12" r="4" stroke="currentColor" stroke-width="1" fill="none"/>
                            <circle cx="18" cy="12" r="4" fill="currentColor"/>
                        </svg>
                        <span>${t['about.sidebar.followFlickr']}</span>
                    </a>
                    <a href="https://www.instagram.com/dcaminosastre/" target="_blank" rel="noopener" class="connect-link">
                        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                            <rect x="2" y="2" width="20" height="20" rx="5" ry="5"/>
                            <path d="M16 11.37A4 4 0 1 1 12.63 8 4 4 0 0 1 16 11.37z"/>
                            <line x1="17.5" y1="6.5" x2="17.51" y2="6.5"/>
                        </svg>
                        <span>${t['about.sidebar.followInstagram']}</span>
                    </a>
                </div>
            </aside>
        </div>
    </section>

    <!-- CTA Section -->
    <section class="cta-section">
        <div class="cta-content">
            <h2>${t['about.cta.title']}</h2>
            <p>${t['about.cta.text']}</p>
            <div class="cta-buttons">
                <a href="https://www.flickr.com/photos/dcaminosastre/" target="_blank" rel="noopener" class="btn-primary">
                    <span>${t['about.cta.flickr']}</span>
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <path d="M7 17L17 7M17 7H7M17 7V17"/>
                    </svg>
                </a>
                <a href="${getPageHref('index.html')}" class="btn-secondary">
                    <span>${t['about.cta.portfolio']}</span>
                </a>
            </div>
        </div>
    </section>

    ${footer({ lang, translations, basePath })}

    <script src="${basePath}/js/main.js"></script>
</body>
</html>`;
}
