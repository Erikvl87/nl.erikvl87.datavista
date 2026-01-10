import type Homey from 'homey/lib/Homey';
import type DataVista from '../app.mjs';

export type ApiRequest = {
	homey: Homey & { app: DataVista };
	query: any;
	body: any;
	params: any;
};
