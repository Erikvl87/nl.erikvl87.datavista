import React from 'react';
import changelogData from '@root/.homeychangelog.json';
import Heading from '@theme/Heading';

interface ChangelogEntry {
  en: string;
}

interface ChangelogData {
  [version: string]: ChangelogEntry;
}

const changelog = changelogData as ChangelogData;

// Get versions and sort them in descending order (newest first)
const versions = Object.keys(changelog).sort((a, b) => {
  const partsA = a.split('.').map(Number);
  const partsB = b.split('.').map(Number);
  
  for (let i = 0; i < Math.max(partsA.length, partsB.length); i++) {
    const numA = partsA[i] || 0;
    const numB = partsB[i] || 0;
    if (numA !== numB) {
      return numB - numA;
    }
  }
  return 0;
});

// Group versions by major.minor
const versionsByMajorMinor = versions.reduce((acc, version) => {
  const [major, minor] = version.split('.');
  const majorMinor = `${major}.${minor}`;
  if (!acc[majorMinor]) {
    acc[majorMinor] = [];
  }
  acc[majorMinor].push(version);
  return acc;
}, {} as Record<string, string[]>);

// Group major.minor by major
const majorMinorsByMajor = Object.keys(versionsByMajorMinor).reduce((acc, majorMinor) => {
  const major = majorMinor.split('.')[0];
  if (!acc[major]) {
    acc[major] = [];
  }
  acc[major].push(majorMinor);
  return acc;
}, {} as Record<string, string[]>);

// Sort major versions descending
const majorVersions = Object.keys(majorMinorsByMajor).sort((a, b) => Number(b) - Number(a));

// Sort minor versions within each major
Object.keys(majorMinorsByMajor).forEach(major => {
  majorMinorsByMajor[major].sort((a, b) => {
    const [, minorA] = a.split('.').map(Number);
    const [, minorB] = b.split('.').map(Number);
    return minorB - minorA;
  });
});

// Export TOC for use in MDX files
export const changelogToc = majorVersions.flatMap(major => {
  const firstMajorMinor = majorMinorsByMajor[major][0];
  const firstVersionInMajor = versionsByMajorMinor[firstMajorMinor][0];
  
  return [
    {
      value: `Version ${major}`,
      id: `version-${firstVersionInMajor}`,
      level: 2
    },
    ...majorMinorsByMajor[major].flatMap(majorMinor => {
      const firstVersionInMinor = versionsByMajorMinor[majorMinor][0];
      
      return [
        {
          value: `Version ${majorMinor}`,
          id: `version-${firstVersionInMinor}`,
          level: 3
        },
        ...versionsByMajorMinor[majorMinor].map(version => ({
          value: `Version ${version}`,
          id: `version-${version}`,
          level: 4
        }))
      ];
    })
  ];
});

export default function Changelog(): JSX.Element {
  return (
    <div>
      {majorVersions.map((major) => (
        <div key={major}>
          {majorMinorsByMajor[major].map((majorMinor) => (
            <div key={majorMinor}>
              {versionsByMajorMinor[majorMinor].map((version) => (
                <div key={version} style={{ marginBottom: '2rem' }}>
                  <Heading as="h2" id={`version-${version}`}>
                    Version {version}
                  </Heading>
                  <p>{changelog[version].en}</p>
                </div>
              ))}
            </div>
          ))}
        </div>
      ))}
    </div>
  );
}
