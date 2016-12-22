import { spawn } from 'child_process';
import { EOL } from 'os';
import { join } from 'path';
import { readFileSync, createWriteStream } from 'fs';

import { execute, defaultStdio, exists } from '../../../helpers';
import { Stdio, Commit } from '../../../types';
import { ReleasePackage } from '../types';

const commitMessage = 'docs(CHANGELOG): append to changelog';

export function generateChangelog (
  releasePackage: ReleasePackage,
  io: Stdio = defaultStdio,
  _spawn = spawn,
  writeStream?: NodeJS.WritableStream): Promise<ReleasePackage>
{
  const { directory } = releasePackage;

  const CHANGELOG = join(directory, 'CHANGELOG.md');

  const fileContents = exists(CHANGELOG) ? readFileSync(CHANGELOG).toString() : EOL;

  const writeFileSream = writeStream || createWriteStream(CHANGELOG);

  return writeChangelog(releasePackage, fileContents, io, writeFileSream)
    .then(() => execute('git', ['add', 'CHANGELOG.md'], io, directory, _spawn))
    .then(() => execute('git', ['commit', '-m', commitMessage], io, directory), _spawn)
    .then(() => releasePackage);
}

function writeChangelog(
  releasePackage: ReleasePackage,
  fileContents: string,
  io: Stdio,
  changelog: NodeJS.WritableStream): Promise<any>
{
  return new Promise((resolve) => {
    const { directory, pkg } = releasePackage;

    io.stdout.write(`${pkg.name}: Generating changelog...`);

    const sections: any = {
      breaks: [] as Commit[],
      feat: [] as Commit[] ,
      fix: [] as Commit[],
      perf: [] as Commit[],
    };

    const titles: any = {
      breaks: `Breaking Changes`,
      feat: `Features`,
      fix: `Bug Fixes`,
      perf: `Performance Improvements`,
    };

    changelog.write(`# ${pkg.version} (${currentDate()})${EOL}---${EOL}`);

    releasePackage.commits.forEach(function (commit: Commit) {
      const message = commit.message;
      const type = message.type;

      if (!titles[type]) return;

      if (message.breakingChanges) {
        sections.breaks.push(commit);
      } else {
        sections[type] = sections[type].concat(commit);
      }
    });

    Object.keys(titles).forEach(section => {
      const commits = sections[section];
      const title = titles[section];

      if (commits.length === 0) return;

      changelog.write(`${EOL}## ${title}${EOL}${EOL}`);

      if (section === 'breaks') {
        commits.forEach((commit: Commit, i: number) => {
          changelog.write(`${i + 1}. ` + commit.message.breakingChanges + EOL);
          changelog.write(
            `  - ${commit.message.raw.split(EOL)[0].trim()} ` +
            `${linkToCommit(commit.hash, pkg.url)}`,
          );
          changelog.write(EOL);
        });
      } else {
        commits.forEach((commit: Commit) => {
          changelog.write(
            `- ${commit.message.raw.split(EOL)[0].trim()} ` +
            `${linkToCommit(commit.hash, pkg.url)}`,
          );
          changelog.write(EOL);
        });
      }
    });

    changelog.write(EOL);

    changelog.write(fileContents);

    changelog.on('end', () => resolve(releasePackage));

    if (typeof changelog.end === 'function')
      setTimeout(() => changelog.end());
    else
      resolve(releasePackage);
  });
}

function linkToCommit (hash: string, url: string) {
  return `[${hash.substr(0, 8)}](${url}/commits/${hash}\)`;
}

export function currentDate () {
  const now = new Date();

  const pad = function (i: number) {
    return ('0' + i).substr(-2);
  };

  return `${now.getFullYear()}-` +
         `${pad(now.getMonth() + 1)}-` +
         `${pad(now.getDate())}`;
}