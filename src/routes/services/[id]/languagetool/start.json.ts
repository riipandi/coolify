import { asyncExecShell, createDirectories, getEngine, getUserDetails } from '$lib/common';
import * as db from '$lib/database';
import { promises as fs } from 'fs';
import yaml from 'js-yaml';
import type { RequestHandler } from '@sveltejs/kit';
import { ErrorHandler, getServiceImage } from '$lib/database';
import { makeLabelForServices } from '$lib/buildPacks/common';

export const post: RequestHandler = async (event) => {
	const { teamId, status, body } = await getUserDetails(event);
	if (status === 401) return { status, body };

	const { id } = event.params;

	try {
		const service = await db.getService({ id, teamId });
		const { type, version, destinationDockerId, destinationDocker } = service;
		const network = destinationDockerId && destinationDocker.network;
		const host = getEngine(destinationDocker.engine);

		const { workdir } = await createDirectories({ repository: type, buildId: id });
		const image = getServiceImage(type);
		const composeFile = {
			version: '3.8',
			services: {
				[id]: {
					container_name: id,
					image: `${image}:${version}`,
					networks: [network],
					restart: 'always',
					volumes: [`${id}-ngrams:/ngrams`],
					labels: makeLabelForServices('languagetool')
				}
			},
			networks: {
				[network]: {
					external: true
				}
			},
			volumes: {
				[`${id}-ngrams`]: {
					external: true
				}
			}
		};
		const composeFileDestination = `${workdir}/docker-compose.yaml`;
		await fs.writeFile(composeFileDestination, yaml.dump(composeFile));
		try {
			await asyncExecShell(`DOCKER_HOST=${host} docker volume create ${id}-ngrams`);
		} catch (error) {
			console.log(error);
		}

		try {
			await asyncExecShell(`DOCKER_HOST=${host} docker compose -f ${composeFileDestination} up -d`);
			return {
				status: 200
			};
		} catch (error) {
			return ErrorHandler(error);
		}
	} catch (error) {
		return ErrorHandler(error);
	}
};