import * as React from 'react';
import * as renderer from 'react-test-renderer';
import chalk from 'chalk';
import * as glob from 'glob';
import * as path from 'path';

import { resetIds } from '../Utilities';

import * as DataUtil from '@uifabric/example-data';
import * as mergeStylesSerializer from '@uifabric/jest-serializer-merge-styles';

const ReactDOM = require('react-dom');

// Extend Jest Expect to allow us to map each component example to its own snapshot file.
const snapshotsStateMap = new Map<string, ISnapshotState>();
const jestSnapshot = require('jest-snapshot');

// jest-snapshot currently has no DefinitelyTyped or module defs so type the one object we care about for now here
interface ISnapshotState {
  _updateSnapshot: string;
  unmatched: number;
  matched: number;
  updated: number;
  added: number;
  getUncheckedCount(): number;
  removeUncheckedKeys(): void;
  save(): void;
}

let globalSnapshotState: ISnapshotState;

// Using this serializer makes sure we capture styling in snapshot output
jestSnapshot.addSerializer(mergeStylesSerializer);

expect.extend({
  toMatchSpecificSnapshot(received, snapshotFile) {
    globalSnapshotState = (this as any).snapshotState;

    // Append .shot to prevent jest failure when it finds .snaps without associated tests.
    const absoluteSnapshotFile = process.cwd() + '/src/components/__snapshots__/' + snapshotFile + '.shot';

    // let's try to retrieve the state from the map - maybe there was already a test that created it
    let snapshotState = snapshotsStateMap.get(absoluteSnapshotFile);

    if (!snapshotState) {
      // if this is a first test that want to use this snapshot, let's create it
      // We have to grab global state's _updateSnapshot setting to make sure jest configuration is honored
      snapshotState = new jestSnapshot.SnapshotState(absoluteSnapshotFile, {
        snapshotPath: absoluteSnapshotFile,
        updateSnapshot: globalSnapshotState._updateSnapshot
      });
      // and save it to the map for tracking
      snapshotsStateMap.set(absoluteSnapshotFile, snapshotState!);
    }

    const newThis = { ...this, snapshotState };
    const patchedToMatchSnapshot = jestSnapshot.toMatchSnapshot.bind(newThis);

    return patchedToMatchSnapshot(received);
  }
});

const excludedExampleFiles: string[] = [
  // NOTE: Please consider modifying your component example to work with this test instead
  //        of adding it to the exclusion list as this will make regression harder to detect.

  // Most of these can probably be resolved by modifying the test or having some underlying function mocked,
  //  but are excluded for now to get base test coverage up immediately.

  'Calendar.Inline.Example.tsx', // date mocking appears to trigger infinite loop
  'ExampleHelper.tsx', // Helper file with no actual component
  'GroupedList.Basic.Example.tsx',
  'GroupedList.Custom.Example.tsx',
  'HoverCard.InstantDismiss.Example.tsx', // https://github.com/OfficeDev/office-ui-fabric-react/issues/6681
  'List.Basic.Example.tsx',
  'List.Ghosting.Example.tsx',
  'List.Grid.Example.tsx',
  'List.Scrolling.Example.tsx',
  'Nav.FabricDemoApp.Example.tsx',
  'Picker.CustomResult.Example.tsx',
  'ScrollablePane.Default.Example.tsx',
  'ScrollablePane.DetailsList.Example.tsx',
  'SelectedPeopleList.Basic.Example.tsx'
];
const excludedExampleFileRegexes: RegExp[] = [
  // Snapshots of these examples are worthless since the component isn't open by default
  /^Panel\./
];

declare const global: any;

/**
 * Automatically consume and test any component examples that are added to the codebase.
 *
 * If you are here and are getting a failure due to a component you recently added,
 *    here are some options:
 *    1) Does your test have a random or time element that causes its output to change every time?
 *       If so, you can mock the random/time function for consistent output, remove random/time element
 *       from the example, or add your component to the exclusion list above.
 *    2) If there is some other run-time issue you can either modify the example or add your component
 *       to the exclusion list above.
 *    3) Only export functions that are React components from your example.
 *
 * In any case, adding your component to the exclusion list is discouraged as this will make regression
 *    harder to catch.
 *
 * If you didn't recently add a component, please review the snapshot output changes to confirm they are
 *    what you expect before submitting a PR.
 */
describe('Component Examples', () => {
  const realDate = Date;
  const realToLocaleString = global.Date.prototype.toLocaleString;
  const realToLocaleTimeString = global.Date.prototype.toLocaleTimeString;
  const realToLocaleDateString = global.Date.prototype.toLocaleDateString;
  const constantDate = new Date(Date.UTC(2017, 0, 6, 4, 41, 20));
  const examplePaths: string[] = glob.sync(path.resolve(process.cwd(), 'src/components/**/examples/*Example*.tsx'));
  const createPortal = ReactDOM.createPortal;

  beforeAll(() => {
    // Mock createPortal to capture its component hierarchy in snapshot output.
    ReactDOM.createPortal = jest.fn(element => {
      return element;
    });

    // Ensure test output is consistent across machine locale and time zone config.
    const mockToLocaleString = () => {
      return constantDate.toUTCString();
    };

    global.Date.prototype.toLocaleString = mockToLocaleString;
    global.Date.prototype.toLocaleTimeString = mockToLocaleString;
    global.Date.prototype.toLocaleDateString = mockToLocaleString;

    // Prevent random and time elements from failing repeated tests.
    global.Date = class {
      public static now() {
        return new realDate(constantDate);
      }

      constructor() {
        return new realDate(constantDate);
      }
    };

    jest.spyOn(DataUtil, 'lorem').mockImplementation(() => {
      return 'lorem text';
    });
    jest.spyOn(Math, 'random').mockImplementation(() => {
      return 0;
    });
  });

  afterAll(() => {
    jest.restoreAllMocks();

    ReactDOM.createPortal = createPortal;

    global.Date = realDate;
    global.Date.prototype.toLocaleString = realToLocaleString;
    global.Date.prototype.toLocaleTimeString = realToLocaleTimeString;
    global.Date.prototype.toLocaleDateString = realToLocaleDateString;

    snapshotsStateMap.forEach(snapshotState => {
      if (snapshotState.getUncheckedCount() > 0) {
        snapshotState.removeUncheckedKeys();
      }

      snapshotState.save();

      // Report results to global state
      // TODO: This module is currently not reporting any snapshots without corresponding test cases.
      //       We should ideally follow Jest behavior and error out or show "obsolete" snapshot output.
      if (globalSnapshotState) {
        globalSnapshotState.unmatched += snapshotState.unmatched;
        globalSnapshotState.matched += snapshotState.matched;
        globalSnapshotState.updated += snapshotState.updated;
        globalSnapshotState.added += snapshotState.added;
      }
    });
  });

  for (const examplePath of examplePaths) {
    const exampleFile = path.basename(examplePath);
    if (excludedExampleFiles.includes(exampleFile) || excludedExampleFileRegexes.some(r => r.test(exampleFile))) {
      continue;
    }

    it(`renders ${exampleFile} correctly`, () => {
      // Resetting ids for each example creates predictability in generated ids.
      resetIds();

      const exampleModule = require(examplePath);

      const exampleExportNames = Object.keys(exampleModule);
      const ComponentUnderTest: React.ComponentType = exampleModule[exampleExportNames[0]];
      if (exampleExportNames.length > 1 || typeof ComponentUnderTest !== 'function') {
        throw new Error(
          'Examples should export exactly one React component, and nothing else.\n' +
            `Found: ${exampleExportNames.map(exp => `${exp} (${typeof exampleModule[exp]})`).join(', ')}`
        );
      }

      let component: renderer.ReactTestRenderer;
      try {
        component = renderer.create(<ComponentUnderTest />);
      } catch (e) {
        // Log with console.log so that the console.warn/error overrides from jest-setup.js don't re-throw the
        // exception in a way that hides the stack/info; and then manually re-throw
        console.log(
          chalk.red(
            `Failure rendering ${exampleExportNames[0]} (from ${examplePath}) as a React component.\n` +
              'Example files must export exactly one React component, and nothing else.\n' +
              '(This error may also occur if an exception is thrown while rendering the example component.)'
          )
        );
        throw e;
      }

      const tree = component.toJSON();
      (expect(tree) as any).toMatchSpecificSnapshot(exampleFile);
    });
  }
});
