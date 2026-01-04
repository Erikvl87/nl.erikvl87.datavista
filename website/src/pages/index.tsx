import type {ReactNode} from 'react';
import clsx from 'clsx';
import Link from '@docusaurus/Link';
import useDocusaurusContext from '@docusaurus/useDocusaurusContext';
import useBaseUrl from '@docusaurus/useBaseUrl';
import Layout from '@theme/Layout';
import HomepageFeatures from '@site/src/components/HomepageFeatures';
import Heading from '@theme/Heading';

import styles from './index.module.css';

function HomepageHeader() {
  const {siteConfig} = useDocusaurusContext();
  const tabletImageUrl = useBaseUrl('/img/tablet-datavista-dashboard.png');
  return (
    <header className={clsx('hero hero--primary', styles.heroBanner)}>
      <div className="container">
        <div className={styles.heroWrapper}>
          <div className={styles.heroContent}>
            <Heading as="h1" className="hero__title">
              {siteConfig.title}
            </Heading>
            <p className="hero__subtitle">{siteConfig.tagline}</p>
            <p className="hero__description">
              Display Homey insights and flow data with gauges, progress bars,
              line charts, toggle switches, status badges, and labels tailored
              to your dashboard.
            </p>
            <div className={styles.buttons}>
              <Link
                className="button button--secondary button--lg"
                to="/docs/getting-started">
                Get Started with DataVista
              </Link>
            </div>
          </div>
          <div className={styles.heroImage}>
            <img
              src={tabletImageUrl}
              alt="DataVista dashboard widgets on a tablet"
              loading="lazy"
            />
          </div>
        </div>
      </div>
    </header>
  );
}

export default function Home(): ReactNode {
  const {siteConfig} = useDocusaurusContext();
  return (
    <Layout
      title={`${siteConfig.title} Documentation`}
      description="Customizable real-time DataVista widgets for Homey dashboards, including gauges, charts, and status tiles.">
      <HomepageHeader />
      <main>
        <HomepageFeatures />
      </main>
    </Layout>
  );
}
