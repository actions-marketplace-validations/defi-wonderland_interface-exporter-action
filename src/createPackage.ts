import glob from 'glob';
import path from 'path';
import fse from 'fs-extra';
import { execSync } from 'child_process';
import { PackageJson } from './types';
import { createReadmeAndLicense } from './createReadmeAndLicense';
import { transformRemappings } from './transformRemappings';
import { PublishType } from './constants';

export const createPackage = (
  exportDir: string,
  outDir: string,
  packageJson: PackageJson,
  publishType: PublishType,
) => {
  const abiDir = `${exportDir}/abi`;
  const contractsDir = `${exportDir}/contracts`;
  const interfacesDir = './solidity/interfaces';
  const interfacesGlob = `${interfacesDir}/**/*.sol`;

  // empty export directory
  fse.emptyDirSync(exportDir);
  fse.writeJsonSync(`${exportDir}/package.json`, packageJson, { spaces: 4 });

  createReadmeAndLicense(packageJson.name, exportDir);

  // list all of the solidity interfaces
  glob(interfacesGlob, (err, interfacePaths) => {
    if (err) throw err;

    // for each interface path
    for (const interfacePath of interfacePaths) {
      const interfaceFile = fse.readFileSync(interfacePath, 'utf8');
      const relativeInterfaceFile = transformRemappings(interfaceFile);

      const contractPath = interfacePath.substring(interfacesDir.length + 1);
      fse.outputFileSync(path.join(contractsDir, contractPath), relativeInterfaceFile);

      // get the interface name
      const interfaceName = interfacePath.substring(interfacePath.lastIndexOf('/') + 1, interfacePath.lastIndexOf('.'));

      // copy interface abi to the export directory
      fse.copySync(`${outDir}/${interfaceName}.sol/${interfaceName}.json`, `${abiDir}/${interfaceName}.json`);
    }
    console.log(`Copied ${interfacePaths.length} interfaces`);

    // install package dependencies
    console.log(`Installing abi dependencies`);
    execSync(`cd ${exportDir} && yarn`);

    // use typechain if needed
    if (publishType === PublishType.ETHERS_V6 || publishType === PublishType.WEB3_V1) {
      console.log(`Generating types for ${publishType}`);
      execSync(
        `yarn typechain --target ${publishType} --out-dir ${exportDir}/${publishType} '${exportDir}/abi/*.json'`,
      );
    }

    // publish package
    try {
      console.log(`Publishing abi dependencies`);
      execSync(`cd ${exportDir} && yarn publish --access public`, { stdio: 'inherit' });
      console.log('Package successfully published.');
    } catch (error) {
      console.error('Failed to publish the package:', error);
      process.exit(1);
    }
  });
};
