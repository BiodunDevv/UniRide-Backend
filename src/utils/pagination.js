/**
 * Paginate results
 * @param {object} query - Mongoose query object
 * @param {object} options - Pagination options
 * @param {number} options.page - Page number (default: 1)
 * @param {number} options.limit - Items per page (default: 10)
 * @param {object} options.sort - Sort options (default: { created_at: -1 })
 * @param {object} options.populate - Populate options
 * @returns {object} - Paginated results with metadata
 */
const paginate = async (query, options = {}) => {
  const page = parseInt(options.page) || 1;
  const limit = parseInt(options.limit) || 10;
  const sort = options.sort || { created_at: -1 };
  const populate = options.populate || null;

  // Calculate skip value
  const skip = (page - 1) * limit;

  // Execute query with pagination
  let resultsQuery = query.skip(skip).limit(limit).sort(sort);

  // Apply population if specified
  if (populate) {
    if (Array.isArray(populate)) {
      populate.forEach((pop) => {
        resultsQuery = resultsQuery.populate(pop);
      });
    } else {
      resultsQuery = resultsQuery.populate(populate);
    }
  }

  const results = await resultsQuery;

  // Get total count
  const total = await query.model.countDocuments(query.getFilter());

  // Calculate metadata
  const totalPages = Math.ceil(total / limit);
  const hasNextPage = page < totalPages;
  const hasPrevPage = page > 1;

  return {
    data: results,
    pagination: {
      total,
      page,
      limit,
      totalPages,
      hasNextPage,
      hasPrevPage,
      nextPage: hasNextPage ? page + 1 : null,
      prevPage: hasPrevPage ? page - 1 : null,
    },
  };
};

/**
 * Simple pagination helper for arrays
 * @param {array} array - Array to paginate
 * @param {number} page - Page number
 * @param {number} limit - Items per page
 * @returns {object} - Paginated results
 */
const paginateArray = (array, page = 1, limit = 10) => {
  const startIndex = (page - 1) * limit;
  const endIndex = startIndex + limit;

  const results = array.slice(startIndex, endIndex);
  const total = array.length;
  const totalPages = Math.ceil(total / limit);

  return {
    data: results,
    pagination: {
      total,
      page,
      limit,
      totalPages,
      hasNextPage: page < totalPages,
      hasPrevPage: page > 1,
    },
  };
};

/**
 * Extract pagination parameters from request query
 * @param {object} query - Express request query object
 * @returns {object} - Pagination options
 */
const getPaginationParams = (query) => {
  const page = parseInt(query.page) || 1;
  const limit = parseInt(query.limit) || 10;
  const sortBy = query.sortBy || 'created_at';
  const sortOrder = query.sortOrder === 'asc' ? 1 : -1;

  // Limit the maximum items per page
  const maxLimit = 100;
  const validLimit = limit > maxLimit ? maxLimit : limit;

  return {
    page: page > 0 ? page : 1,
    limit: validLimit,
    sort: { [sortBy]: sortOrder },
  };
};

/**
 * Create pagination response
 * @param {array} data - Result data
 * @param {number} total - Total count
 * @param {number} page - Current page
 * @param {number} limit - Items per page
 * @returns {object} - Response with pagination metadata
 */
const createPaginationResponse = (data, total, page, limit) => {
  const totalPages = Math.ceil(total / limit);

  return {
    success: true,
    data,
    pagination: {
      total,
      page,
      limit,
      totalPages,
      hasNextPage: page < totalPages,
      hasPrevPage: page > 1,
      nextPage: page < totalPages ? page + 1 : null,
      prevPage: page > 1 ? page - 1 : null,
    },
  };
};

module.exports = {
  paginate,
  paginateArray,
  getPaginationParams,
  createPaginationResponse,
};
