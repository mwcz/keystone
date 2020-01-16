const { pipelineBuilder, mutationBuilder } = require('../lib/join-builder');

describe('join builder', () => {
  test('correctly generates joins for simple queries', () => {
    /*
     * From this query:

      {
        name: 'foobar',
        age: 23,
      }

    */
    const pipeline = pipelineBuilder({
      matchTerm: { $and: [{ name: { $eq: 'foobar' } }, { age: { $eq: 23 } }] },
      postJoinPipeline: [],
      relationships: {},
    });

    expect(pipeline).toMatchObject([
      { $match: { $and: [{ name: { $eq: 'foobar' } }, { age: { $eq: 23 } }] } },
      { $addFields: { id: '$_id' } },
    ]);
  });

  test('correctly generates joins for to-one relationships', () => {
    /*
     * From this query:

      {
        title: 'foobar',
        views: 23,
        author: {
          name: 'Alice',
        },
      }

    */
    const pipeline = pipelineBuilder({
      relationships: {
        abc123: {
          matchTerm: { name: { $eq: 'Alice' } },
          relationshipInfo: {
            from: 'user-collection',
            field: 'author',
            many: false,
            uniqueField: 'abc123_author',
          },
          postJoinPipeline: [],
          relationships: {},
        },
      },
      matchTerm: {
        $and: [
          { title: { $eq: 'foobar' } },
          { views: { $eq: 23 } },
          { $expr: { $eq: [{ $size: '$abc123_author' }, 1] } },
        ],
      },
      postJoinPipeline: [],
    });

    expect(pipeline).toMatchObject([
      {
        $lookup: {
          from: 'user-collection',
          as: 'abc123_author',
          let: { abc123_author_id: '$author' },
          pipeline: [
            { $match: { $expr: { $eq: ['$_id', '$$abc123_author_id'] } } },
            { $match: { name: { $eq: 'Alice' } } },
            { $addFields: { id: '$_id' } },
          ],
        },
      },
      {
        $match: {
          $and: [
            { title: { $eq: 'foobar' } },
            { views: { $eq: 23 } },
            { $expr: { $eq: [{ $size: '$abc123_author' }, 1] } },
          ],
        },
      },
      { $addFields: { id: '$_id' } },
    ]);
  });

  test('correctly generates joins for relationships with no filters', () => {
    /*
     * From this query:

      {
        name: 'foobar',
        age: 23,
        posts_every: {},
      }

    */
    const pipeline = pipelineBuilder({
      relationships: {
        abc123: {
          relationshipInfo: {
            from: 'posts-collection',
            field: 'posts',
            many: true,
            uniqueField: 'abc123_posts',
          },
          postJoinPipeline: [],
          relationships: {},
        },
      },
      matchTerm: {
        $and: [
          { name: { $eq: 'foobar' } },
          { age: { $eq: 23 } },
          { $expr: { $gt: [{ $size: '$abc123_posts' }, 0] } },
        ],
      },
      postJoinPipeline: [],
    });

    expect(pipeline).toMatchObject([
      {
        $lookup: {
          from: 'posts-collection',
          as: 'abc123_posts',
          let: { abc123_posts_ids: { $ifNull: ['$posts', []] } },
          pipeline: [
            { $match: { $expr: { $in: ['$_id', '$$abc123_posts_ids'] } } },
            { $addFields: { id: '$_id' } },
          ],
        },
      },
      {
        $match: {
          $and: [
            { name: { $eq: 'foobar' } },
            { age: { $eq: 23 } },
            { $expr: { $gt: [{ $size: '$abc123_posts' }, 0] } },
          ],
        },
      },
      { $addFields: { id: '$_id' } },
    ]);
  });

  test('correctly generates joins for relationships with postJoinPipeline', () => {
    /*
     * From this query:

      {
        name: 'foobar',
        age: 23,
        posts_every: {},
      }

    */
    const pipeline = pipelineBuilder({
      relationships: {
        abc123: {
          relationshipInfo: {
            from: 'posts-collection',
            field: 'posts',
            many: true,
            uniqueField: 'abc123_posts',
          },
          postJoinPipeline: [{ $orderBy: 'title' }],
          relationships: {},
        },
      },
      matchTerm: {
        $and: [
          { name: { $eq: 'foobar' } },
          { age: { $eq: 23 } },
          { $expr: { $eq: [{ $size: '$abc123_posts' }, { $size: { $ifNull: ['$posts', []] } }] } },
        ],
      },
      postJoinPipeline: [{ $limit: 10 }],
    });

    expect(pipeline).toMatchObject([
      {
        $lookup: {
          from: 'posts-collection',
          as: 'abc123_posts',
          let: { abc123_posts_ids: { $ifNull: ['$posts', []] } },
          pipeline: [
            { $match: { $expr: { $in: ['$_id', '$$abc123_posts_ids'] } } },
            { $addFields: { id: '$_id' } },
            { $orderBy: 'title' },
          ],
        },
      },
      {
        $match: {
          $and: [
            { name: { $eq: 'foobar' } },
            { age: { $eq: 23 } },
            {
              $expr: { $eq: [{ $size: '$abc123_posts' }, { $size: { $ifNull: ['$posts', []] } }] },
            },
          ],
        },
      },
      { $addFields: { id: '$_id' } },
      { $limit: 10 },
    ]);
  });

  test('correctly generates joins for nested relationships', () => {
    /*
     * From this query:

      {
        name: 'foobar',
        age: 23,
        posts_every: {
          title: 'hello',
          tags_some: {
            name: 'React',
            posts_every: {
              published: true,
            },
          },
        },
      }

    */
    const pipeline = pipelineBuilder({
      relationships: {
        abc123: {
          matchTerm: {
            $and: [{ title: { $eq: 'hello' } }, { $expr: { $gt: [{ $size: '$def456_tags' }, 0] } }],
          },
          relationshipInfo: {
            from: 'posts-collection',
            field: 'posts',
            many: true,
            uniqueField: 'abc123_posts',
          },
          postJoinPipeline: [],
          relationships: {
            def456: {
              matchTerm: {
                $and: [
                  { name: { $eq: 'React' } },
                  {
                    $expr: {
                      $eq: [{ $size: '$xyz890_posts' }, { $size: { $ifNull: ['$posts', []] } }],
                    },
                  },
                ],
              },
              relationshipInfo: {
                from: 'tags-collection',
                field: 'tags',
                many: true,
                uniqueField: 'def456_tags',
              },
              postJoinPipeline: [],
              relationships: {
                xyz890: {
                  matchTerm: { published: { $eq: true } },
                  relationshipInfo: {
                    from: 'posts-collection',
                    field: 'posts',
                    many: true,
                    uniqueField: 'xyz890_posts',
                  },
                  postJoinPipeline: [],
                  relationships: {},
                },
              },
            },
          },
        },
      },
      matchTerm: {
        $and: [
          { name: { $eq: 'foobar' } },
          { age: { $eq: 23 } },
          { $expr: { $gt: [{ $size: '$abc123_posts' }, 0] } },
        ],
      },
      postJoinPipeline: [],
    });

    expect(pipeline).toMatchObject([
      {
        $lookup: {
          from: 'posts-collection',
          as: 'abc123_posts',
          let: { abc123_posts_ids: { $ifNull: ['$posts', []] } },
          pipeline: [
            { $match: { $expr: { $in: ['$_id', '$$abc123_posts_ids'] } } },
            {
              $lookup: {
                from: 'tags-collection',
                as: 'def456_tags',
                let: { def456_tags_ids: { $ifNull: ['$tags', []] } },
                pipeline: [
                  { $match: { $expr: { $in: ['$_id', '$$def456_tags_ids'] } } },
                  {
                    $lookup: {
                      from: 'posts-collection',
                      as: 'xyz890_posts',
                      let: { xyz890_posts_ids: { $ifNull: ['$posts', []] } },
                      pipeline: [
                        { $match: { $expr: { $in: ['$_id', '$$xyz890_posts_ids'] } } },
                        { $match: { published: { $eq: true } } },
                        { $addFields: { id: '$_id' } },
                      ],
                    },
                  },

                  {
                    $match: {
                      $and: [
                        { name: { $eq: 'React' } },
                        {
                          $expr: {
                            $eq: [
                              { $size: '$xyz890_posts' },
                              { $size: { $ifNull: ['$posts', []] } },
                            ],
                          },
                        },
                      ],
                    },
                  },
                  { $addFields: { id: '$_id' } },
                ],
              },
            },
            {
              $match: {
                $and: [
                  { title: { $eq: 'hello' } },
                  { $expr: { $gt: [{ $size: '$def456_tags' }, 0] } },
                ],
              },
            },
            { $addFields: { id: '$_id' } },
          ],
        },
      },
      {
        $match: {
          $and: [
            { name: { $eq: 'foobar' } },
            { age: { $eq: 23 } },
            { $expr: { $gt: [{ $size: '$abc123_posts' }, 0] } },
          ],
        },
      },
      { $addFields: { id: '$_id' } },
    ]);
  });

  test('correctly generates joins with nested AND', () => {
    /*
     * From this query:

      {
        AND: [
          { name: 'foobar' },
          { age: 23 },
          {
            posts_every: {
              AND: [{ title: 'hello' }, { labels_some: { name: 'foo' } }],
            },
          },
        ],
      }
    */

    const pipeline = pipelineBuilder({
      relationships: {
        zip567: {
          matchTerm: {
            $and: [
              { title: { $eq: 'hello' } },
              { $expr: { $gt: [{ $size: '$quux987_labels' }, 0] } },
            ],
          },
          relationshipInfo: {
            from: 'posts-collection',
            field: 'posts',
            many: true,
            uniqueField: 'zip567_posts',
          },
          postJoinPipeline: [],
          relationships: {
            quux987: {
              matchTerm: { name: { $eq: 'foo' } },
              relationshipInfo: {
                from: 'labels-collection',
                field: 'labels',
                many: true,
                uniqueField: 'quux987_labels',
              },
              postJoinPipeline: [],
              relationships: {},
            },
          },
        },
      },
      matchTerm: {
        $and: [
          { name: { $eq: 'foobar' } },
          { age: { $eq: 23 } },
          {
            $expr: {
              $eq: [{ $size: '$zip567_posts' }, { $size: { $ifNull: ['$posts', []] } }],
            },
          },
        ],
      },
      postJoinPipeline: [],
    });

    expect(pipeline).toMatchObject([
      {
        $lookup: {
          from: 'posts-collection',
          as: 'zip567_posts',
          let: { zip567_posts_ids: { $ifNull: ['$posts', []] } },
          pipeline: [
            { $match: { $expr: { $in: ['$_id', '$$zip567_posts_ids'] } } },
            {
              $lookup: {
                from: 'labels-collection',
                as: 'quux987_labels',
                let: { quux987_labels_ids: { $ifNull: ['$labels', []] } },
                pipeline: [
                  { $match: { $expr: { $in: ['$_id', '$$quux987_labels_ids'] } } },
                  { $match: { name: { $eq: 'foo' } } },
                  { $addFields: { id: '$_id' } },
                ],
              },
            },
            {
              $match: {
                $and: [
                  { title: { $eq: 'hello' } },
                  { $expr: { $gt: [{ $size: '$quux987_labels' }, 0] } },
                ],
              },
            },
            { $addFields: { id: '$_id' } },
          ],
        },
      },
      {
        $match: {
          $and: [
            { name: { $eq: 'foobar' } },
            { age: { $eq: 23 } },
            {
              $expr: {
                $eq: [{ $size: '$zip567_posts' }, { $size: { $ifNull: ['$posts', []] } }],
              },
            },
          ],
        },
      },
      { $addFields: { id: '$_id' } },
    ]);
  });

  test('correctly generates joins with nested OR', () => {
    /*
     * From this query:

      {
        OR: [
          { name: 'foobar' },
          { age: 23 },
          {
            posts_every: {
              OR: [{ title: 'hello' }, { labels_some: { name: 'foo' } }],
            },
          },
        ],
      }
    */

    const pipeline = pipelineBuilder({
      relationships: {
        zip567: {
          matchTerm: {
            $or: [
              { title: { $eq: 'hello' } },
              { $expr: { $gt: [{ $size: '$quux987_labels' }, 0] } },
            ],
          },
          relationshipInfo: {
            from: 'posts-collection',
            field: 'posts',
            many: true,
            uniqueField: 'zip567_posts',
          },
          postJoinPipeline: [],
          relationships: {
            quux987: {
              matchTerm: { name: { $eq: 'foo' } },
              relationshipInfo: {
                from: 'labels-collection',
                field: 'labels',
                many: true,
                uniqueField: 'quux987_labels',
              },
              postJoinPipeline: [],
              relationships: {},
            },
          },
        },
      },
      matchTerm: {
        $or: [
          { name: { $eq: 'foobar' } },
          { age: { $eq: 23 } },
          {
            $expr: {
              $eq: [{ $size: '$zip567_posts' }, { $size: { $ifNull: ['$posts', []] } }],
            },
          },
        ],
      },
      postJoinPipeline: [],
    });

    expect(pipeline).toMatchObject([
      {
        $lookup: {
          from: 'posts-collection',
          as: 'zip567_posts',
          let: { zip567_posts_ids: { $ifNull: ['$posts', []] } },
          pipeline: [
            { $match: { $expr: { $in: ['$_id', '$$zip567_posts_ids'] } } },
            {
              $lookup: {
                from: 'labels-collection',
                as: 'quux987_labels',
                let: { quux987_labels_ids: { $ifNull: ['$labels', []] } },
                pipeline: [
                  { $match: { $expr: { $in: ['$_id', '$$quux987_labels_ids'] } } },
                  {
                    $match: { name: { $eq: 'foo' } },
                  },
                  { $addFields: { id: '$_id' } },
                ],
              },
            },
            {
              $match: {
                $or: [
                  { title: { $eq: 'hello' } },
                  { $expr: { $gt: [{ $size: '$quux987_labels' }, 0] } },
                ],
              },
            },
            { $addFields: { id: '$_id' } },
          ],
        },
      },
      {
        $match: {
          $or: [
            { name: { $eq: 'foobar' } },
            { age: { $eq: 23 } },
            {
              $expr: {
                $eq: [{ $size: '$zip567_posts' }, { $size: { $ifNull: ['$posts', []] } }],
              },
            },
          ],
        },
      },
      { $addFields: { id: '$_id' } },
    ]);
  });

  test('correctly generates joins with nested AND/OR', () => {
    /*
     * From this query:

      {
        AND: [
          { name: 'foobar' },
          { age: 23 },
          {
            posts_every: {
              OR: [{ title: 'hello' }, { labels_some: { name: 'foo' } }],
            },
          },
        ],
      }
    */

    const pipeline = pipelineBuilder({
      relationships: {
        zip567: {
          matchTerm: {
            $or: [
              { title: { $eq: 'hello' } },
              { $expr: { $gt: [{ $size: '$quux987_labels' }, 0] } },
            ],
          },

          relationshipInfo: {
            from: 'posts-collection',
            field: 'posts',
            many: true,
            uniqueField: 'zip567_posts',
          },
          postJoinPipeline: [],
          relationships: {
            quux987: {
              matchTerm: { name: { $eq: 'foo' } },
              relationshipInfo: {
                from: 'labels-collection',
                field: 'labels',
                many: true,
                uniqueField: 'quux987_labels',
              },
              postJoinPipeline: [],
              relationships: {},
            },
          },
        },
      },
      matchTerm: {
        $and: [
          { name: { $eq: 'foobar' } },
          { age: { $eq: 23 } },
          {
            $expr: {
              $eq: [{ $size: '$zip567_posts' }, { $size: { $ifNull: ['$posts', []] } }],
            },
          },
        ],
      },
      postJoinPipeline: [],
    });

    expect(pipeline).toMatchObject([
      {
        $lookup: {
          from: 'posts-collection',
          as: 'zip567_posts',
          let: { zip567_posts_ids: { $ifNull: ['$posts', []] } },
          pipeline: [
            { $match: { $expr: { $in: ['$_id', '$$zip567_posts_ids'] } } },
            {
              $lookup: {
                from: 'labels-collection',
                as: 'quux987_labels',
                let: { quux987_labels_ids: { $ifNull: ['$labels', []] } },
                pipeline: [
                  { $match: { $expr: { $in: ['$_id', '$$quux987_labels_ids'] } } },
                  {
                    $match: { name: { $eq: 'foo' } },
                  },
                  { $addFields: { id: '$_id' } },
                ],
              },
            },
            {
              $match: {
                $or: [
                  { title: { $eq: 'hello' } },
                  { $expr: { $gt: [{ $size: '$quux987_labels' }, 0] } },
                ],
              },
            },
            { $addFields: { id: '$_id' } },
          ],
        },
      },
      {
        $match: {
          $and: [
            { name: { $eq: 'foobar' } },
            { age: { $eq: 23 } },
            {
              $expr: {
                $eq: [{ $size: '$zip567_posts' }, { $size: { $ifNull: ['$posts', []] } }],
              },
            },
          ],
        },
      },
      { $addFields: { id: '$_id' } },
    ]);
  });

  test('correctly generates joins with nested OR/AND', () => {
    /*
     * From this query:

      {
        OR: [
          { name: 'foobar' },
          { age: 23 },
          {
            posts_every: {
              AND: [{ title: 'hello' }, { labels_some: { name: 'foo' } }],
            },
          },
        ],
      }
    */

    const pipeline = pipelineBuilder({
      relationships: {
        zip567: {
          matchTerm: {
            $and: [
              { title: { $eq: 'hello' } },
              { $expr: { $gt: [{ $size: '$quux987_labels' }, 0] } },
            ],
          },
          relationshipInfo: {
            from: 'posts-collection',
            field: 'posts',
            many: true,
            uniqueField: 'zip567_posts',
          },
          postJoinPipeline: [],
          relationships: {
            quux987: {
              matchTerm: { name: { $eq: 'foo' } },
              relationshipInfo: {
                from: 'labels-collection',
                field: 'labels',
                many: true,
                uniqueField: 'quux987_labels',
              },
              postJoinPipeline: [],
              relationships: {},
            },
          },
        },
      },
      matchTerm: {
        $or: [
          { name: { $eq: 'foobar' } },
          { age: { $eq: 23 } },
          {
            $expr: {
              $eq: [{ $size: '$zip567_posts' }, { $size: { $ifNull: ['$posts', []] } }],
            },
          },
        ],
      },
      postJoinPipeline: [],
    });

    expect(pipeline).toMatchObject([
      {
        $lookup: {
          from: 'posts-collection',
          as: 'zip567_posts',
          let: { zip567_posts_ids: { $ifNull: ['$posts', []] } },
          pipeline: [
            { $match: { $expr: { $in: ['$_id', '$$zip567_posts_ids'] } } },
            {
              $lookup: {
                from: 'labels-collection',
                as: 'quux987_labels',
                let: { quux987_labels_ids: { $ifNull: ['$labels', []] } },
                pipeline: [
                  { $match: { $expr: { $in: ['$_id', '$$quux987_labels_ids'] } } },
                  { $match: { name: { $eq: 'foo' } } },
                  { $addFields: { id: '$_id' } },
                ],
              },
            },
            {
              $match: {
                $and: [
                  { title: { $eq: 'hello' } },
                  { $expr: { $gt: [{ $size: '$quux987_labels' }, 0] } },
                ],
              },
            },
            { $addFields: { id: '$_id' } },
          ],
        },
      },
      {
        $match: {
          $or: [
            { name: { $eq: 'foobar' } },
            { age: { $eq: 23 } },
            {
              $expr: {
                $eq: [{ $size: '$zip567_posts' }, { $size: { $ifNull: ['$posts', []] } }],
              },
            },
          ],
        },
      },
      { $addFields: { id: '$_id' } },
    ]);
  });

  test('executes relationship mutators with correct parameters', () => {
    // TODO - check it's called with these params:
    /*
     * From this query:

      {
        age: 23,
        posts_every: { title: 'hello' },
      }
    */

    const mutationResult = {};

    const postQueryMutations = mutationBuilder({
      zip567: {
        matchTerm: { title: { $eq: 'hello' } },

        relationshipInfo: {
          from: 'posts-collection',
          field: 'posts',
          many: true,
          uniqueField: 'zip567_posts',
        },
        postJoinPipeline: [],
        relationships: {},
      },
    });

    /*
      {
        age: 23,
        posts_every: { title: 'hello' },
      }
    */
    const mockResult1 = {
      age: 23,
      name: 'foobar',
      zip567_posts: [
        {
          title: 'hello',
          views: 73,
        },
        {
          title: 'hello',
          views: 57,
        },
      ],
    };

    const mockResult2 = {
      age: 23,
      name: 'quux',
      zip567_posts: [
        {
          title: 'hello',
          views: 123,
        },
        {
          title: 'hello',
          views: 1,
        },
      ],
    };

    const mockQueryResult = [mockResult1, mockResult2];

    const mutatedResult = postQueryMutations(mockQueryResult);

    expect(mutatedResult).toMatchObject([mutationResult, mutationResult]);
  });
});
