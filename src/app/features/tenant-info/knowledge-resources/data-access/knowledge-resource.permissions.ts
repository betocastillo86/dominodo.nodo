/**
 * Permission codes for the Knowledge Resources module ("Base de conocimiento"),
 * matching the API's catalog exactly.
 *
 * There is no `knowledge.create` nor `knowledge.delete`: writing (create,
 * update and the Draft/Published/Archived transitions) is all covered by
 * `knowledge.edit`.
 */
export const KNOWLEDGE_VIEW = 'knowledge.view';
export const KNOWLEDGE_EDIT = 'knowledge.edit';
