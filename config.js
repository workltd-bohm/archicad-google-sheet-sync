import { DOMParser } from '@xmldom/xmldom'
import { select, select1 } from 'xpath';
import { readFileSync } from 'fs';
import { homedir } from 'os';



const configData = readFileSync(homedir() + '/bohm/config/add-on-config.xml', 'utf8');
const configXmlDoc = new DOMParser().parseFromString(configData, 'text/xml');

export const configurationCorePropertyMap = select("/configuration/property-groups/core", configXmlDoc).map(corePtyGpNode => {
    return {
        key: select1("@name", corePtyGpNode).value,
        value: select("property", corePtyGpNode).map(corePtyNode => {
            return select1("@name", corePtyNode).value;
        })
    };
}).reduce((acc, cur) => {
    acc.set(cur.key, cur.value);
    return acc;
}, new Map());

export const configurationCustomPropertyMap = select("/configuration/property-groups/custom", configXmlDoc).map(customPtyGpNode => {
    return {
        key: select1("@name", customPtyGpNode).value,
        value: select("property", customPtyGpNode).map(customPtyNode => {
            return select1("@name", customPtyNode).value;
        })
    };
}).reduce((acc, cur) => {
    acc.set(cur.key, cur.value);
    return acc;
}, new Map());

export const classificationOptionMap = select("/configuration/classification-options/classification", configXmlDoc).map(optionNode => {
    return {
        key: select1("@code", optionNode).value,
        value: select1("@name", optionNode).value
    };
}).reduce((acc, cur) => {
    acc.set(cur.key, cur.value);
    return acc;
}, new Map());

export const classificationGroupOptionMap = select("/configuration/classification-group-options/classification", configXmlDoc).map(optionNode => {
    return {
        key: select1("@code", optionNode).value,
        value: select1("@name", optionNode).value
    };
}).reduce((acc, cur) => {
    acc.set(cur.key, cur.value);
    return acc;
}, new Map());
